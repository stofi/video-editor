/**
 * Core editor — wires up the video, timeline, toolbar, and FFmpeg export.
 */
import { getFFmpeg } from './ffmpeg.js'
import { Timeline } from './timeline.js'
import { fetchFile } from '@ffmpeg/util'

export class Editor {
  constructor() {
    this.file = null
    this.videoEl = document.getElementById('preview-video')
    this.processingOverlay = document.getElementById('processing-overlay')
    this.processingLabel = document.getElementById('processing-label')
    this.progressBar = document.getElementById('progress-bar')
    this.timeDisplay = document.getElementById('time-display')

    this.activeTool = 'trim'
    this.speed = 1
    this.muteAudio = false
    this.trimStart = 0
    this.trimEnd = 0

    this.timeline = new Timeline({
      wrap:         document.getElementById('timeline-wrap'),
      canvas:       document.getElementById('waveform-canvas'),
      trimRegion:   document.getElementById('trim-region'),
      startHandle:  document.getElementById('trim-start'),
      endHandle:    document.getElementById('trim-end'),
      playhead:     document.getElementById('playhead'),
      onTrimChange: (s, e) => { this.trimStart = s; this.trimEnd = e },
    })

    this._bindPlayback()
    this._bindToolbar()
    this._bindExport()
  }

  async load(file) {
    this.file = file
    // Revoke previous blob URL to avoid memory leak
    if (this._objectURL) URL.revokeObjectURL(this._objectURL)
    this._objectURL = URL.createObjectURL(file)
    this.videoEl.src = this._objectURL

    await new Promise((res) => { this.videoEl.onloadedmetadata = res })
    this.trimStart = 0
    this.trimEnd = this.videoEl.duration
    this.timeline.setDuration(this.videoEl.duration)
    this._updateTimeDisplay()

    // Attempt waveform extraction (best-effort)
    this._extractWaveform(file).catch(() => this.timeline.drawFlatWaveform())
  }

  async _extractWaveform(file) {
    const arrayBuffer = await file.arrayBuffer()
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    // Mobile browsers may start AudioContext in suspended state
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    this.timeline.drawWaveform(audioBuffer)
    audioCtx.close()
  }

  _bindPlayback() {
    const playBtn = document.getElementById('btn-play')
    const iconPlay = document.getElementById('icon-play')
    const iconPause = document.getElementById('icon-pause')
    const muteBtn = document.getElementById('btn-mute')

    playBtn.addEventListener('click', () => {
      if (this.videoEl.paused) {
        // Clamp playback to trim region
        if (this.videoEl.currentTime < this.trimStart || this.videoEl.currentTime >= this.trimEnd) {
          this.videoEl.currentTime = this.trimStart
        }
        this.videoEl.play().catch(() => {/* interrupted — ignore */})
      } else {
        this.videoEl.pause()
      }
    })

    muteBtn.addEventListener('click', () => {
      this.videoEl.muted = !this.videoEl.muted
      muteBtn.style.opacity = this.videoEl.muted ? '0.4' : '1'
    })

    this.videoEl.addEventListener('play',  () => { iconPlay.hidden = true;  iconPause.hidden = false })
    this.videoEl.addEventListener('pause', () => { iconPlay.hidden = false; iconPause.hidden = true  })

    this.videoEl.addEventListener('timeupdate', () => {
      const t = this.videoEl.currentTime
      // Stop at trim end
      if (t >= this.trimEnd) { this.videoEl.pause(); this.videoEl.currentTime = this.trimEnd }
      this.timeline.setPlayhead(t)
      this._updateTimeDisplay()
    })
  }

  _bindToolbar() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool
        this._setActiveTool(tool)
      })
    })

    // Speed slider
    const speedSlider = document.getElementById('speed-slider')
    const speedValue  = document.getElementById('speed-value')
    speedSlider.addEventListener('input', () => {
      this.speed = parseFloat(speedSlider.value)
      speedValue.textContent = `${this.speed}×`
      this.videoEl.playbackRate = this.speed
    })
  }

  _setActiveTool(tool) {
    this.activeTool = tool
    document.querySelectorAll('.tool-btn[data-tool]').forEach((b) =>
      b.classList.toggle('active', b.dataset.tool === tool)
    )

    const panels = document.querySelectorAll('.tool-panel')
    panels.forEach((p) => { p.hidden = true })

    if (tool === 'speed') {
      document.getElementById('panel-speed').hidden = false
    } else if (tool === 'mute-audio') {
      this.muteAudio = !this.muteAudio
      document.querySelector('[data-tool="mute-audio"]').style.color =
        this.muteAudio ? 'var(--danger)' : ''
    }
  }

  _bindExport() {
    document.getElementById('btn-export').addEventListener('click', () => this._export())
  }

  async _export() {
    if (!this.file) return

    this._showProcessing('Loading FFmpeg…')

    let ff
    try {
      ff = await getFFmpeg((progress) => {
        this.progressBar.style.width = `${Math.round(progress * 100)}%`
      })
    } catch (err) {
      console.error(err)
      this._hideProcessing()
      alert('Failed to load FFmpeg. Check your browser supports SharedArrayBuffer (HTTPS required).')
      return
    }

    this._showProcessing('Processing…')

    try {
      const inputName = 'input' + this.file.name.slice(this.file.name.lastIndexOf('.'))
      const outputName = 'output.mp4'

      await ff.writeFile(inputName, await fetchFile(this.file))

      const args = ['-i', inputName]

      // Trim
      const start = this.trimStart.toFixed(3)
      const duration = (this.trimEnd - this.trimStart).toFixed(3)
      args.push('-ss', start, '-t', duration)

      // Speed (via setpts + atempo)
      if (this.speed !== 1) {
        const vf = `setpts=${(1 / this.speed).toFixed(4)}*PTS`
        args.push('-vf', vf)
        if (!this.muteAudio) {
          // atempo only supports 0.5–2; chain for values outside that range
          const tempos = _buildAtempo(this.speed)
          args.push('-af', tempos.map((v) => `atempo=${v}`).join(','))
        }
      }

      // Mute
      if (this.muteAudio) args.push('-an')

      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23')
      if (!this.muteAudio) args.push('-c:a', 'aac')
      args.push(outputName)

      await ff.exec(args)

      const data = await ff.readFile(outputName)
      const blob = new Blob([data.buffer], { type: 'video/mp4' })
      const url  = URL.createObjectURL(blob)

      // Use navigator.share on mobile if available, fall back to anchor download
      if (navigator.canShare?.({ files: [new File([blob], 'video.mp4', { type: 'video/mp4' })] })) {
        const shareFile = new File([blob], 'edited-' + this.file.name.replace(/\.[^.]+$/, '') + '.mp4', { type: 'video/mp4' })
        await navigator.share({ files: [shareFile] }).catch(() => {/* dismissed */})
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = 'edited-' + this.file.name.replace(/\.[^.]+$/, '') + '.mp4'
        // Append to DOM required for Safari iOS
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }

      // Cleanup
      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
    } catch (err) {
      console.error(err)
      alert('Export failed. See console for details.')
    } finally {
      this._hideProcessing()
    }
  }

  _showProcessing(label = 'Processing…') {
    this.processingLabel.textContent = label
    this.progressBar.style.width = '0%'
    this.processingOverlay.hidden = false
  }

  _hideProcessing() {
    this.processingOverlay.hidden = true
  }

  _updateTimeDisplay() {
    const fmt = (s) => {
      const m = Math.floor(s / 60)
      const sec = Math.floor(s % 60).toString().padStart(2, '0')
      return `${m}:${sec}`
    }
    this.timeDisplay.textContent =
      `${fmt(this.videoEl.currentTime)} / ${fmt(this.videoEl.duration || 0)}`
  }
}

/** Build atempo filter chain — each value must be in [0.5, 2] */
function _buildAtempo(speed) {
  const result = []
  let remaining = speed
  while (remaining > 2) { result.push(2); remaining /= 2 }
  while (remaining < 0.5) { result.push(0.5); remaining /= 0.5 }
  result.push(parseFloat(remaining.toFixed(4)))
  return result
}
