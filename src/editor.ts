/**
 * Core editor — wires up the video, timeline, toolbar, and FFmpeg export.
 */
import { getFFmpeg } from './ffmpeg.js'
import { Timeline } from './timeline.js'
import { CropOverlay, type AspectPreset } from './crop.js'
import { ImageOverlay } from './overlay.js'
import { fetchFile } from '@ffmpeg/util'

type Tool = 'trim' | 'crop' | 'rotate' | 'speed' | 'mute-audio' | 'overlay'
type Rotation = 0 | 90 | 180 | 270

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id)
  if (!e) throw new Error(`#${id} not found`)
  return e as T
}

export class Editor {
  private file: File | null = null
  private _objectURL: string | null = null

  private readonly videoEl        = el<HTMLVideoElement>('preview-video')
  private readonly processingEl   = el('processing-overlay')
  private readonly processingLabel = el('processing-label')
  private readonly progressBar    = el('progress-bar')
  private readonly timeDisplay    = el('time-display')

  private speed = 1
  private muteAudio = false
  private trimStart = 0
  private trimEnd = 0
  private rotation: Rotation = 0
  private flipH = false
  private flipV = false

  private readonly crop = new CropOverlay(
    el('preview-area'),
    el<HTMLVideoElement>('preview-video'),
  )

  private readonly imgOverlay = new ImageOverlay(
    el('preview-area'),
    el<HTMLVideoElement>('preview-video'),
  )

  private readonly timeline = new Timeline({
    wrap:        el('timeline-wrap'),
    canvas:      el<HTMLCanvasElement>('waveform-canvas'),
    trimRegion:  el('trim-region'),
    startHandle: el('trim-start'),
    endHandle:   el('trim-end'),
    playhead:    el('playhead'),
    onTrimChange: (s, e) => { this.trimStart = s; this.trimEnd = e },
  })

  constructor() {
    this._bindPlayback()
    this._bindToolbar()
    this._bindExport()
  }

  async load(file: File): Promise<void> {
    this.file = file
    if (this._objectURL) URL.revokeObjectURL(this._objectURL)
    this._objectURL = URL.createObjectURL(file)
    this.videoEl.src = this._objectURL

    this.rotation = 0; this.flipH = false; this.flipV = false
    this._updateVideoTransform()

    await new Promise<void>((res) => { this.videoEl.onloadedmetadata = () => res() })
    this.trimStart = 0
    this.trimEnd = this.videoEl.duration
    this.timeline.setDuration(this.videoEl.duration)
    this._updateTimeDisplay()

    this._extractWaveform(file).catch(() => this.timeline.drawFlatWaveform())
    this.timeline.drawThumbnails(this.videoEl).catch(() => { /* best-effort */ })
  }

  private async _extractWaveform(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer()
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext
    if (!AudioCtx) return
    const audioCtx = new AudioCtx()
    if (audioCtx.state === 'suspended') await audioCtx.resume()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    this.timeline.drawWaveform(audioBuffer)
    void audioCtx.close()
  }

  private _bindPlayback(): void {
    const playBtn   = el('btn-play')
    const iconPlay  = el('icon-play')
    const iconPause = el('icon-pause')
    const muteBtn   = el('btn-mute')

    playBtn.addEventListener('click', () => {
      if (this.videoEl.paused) {
        if (this.videoEl.currentTime < this.trimStart || this.videoEl.currentTime >= this.trimEnd) {
          this.videoEl.currentTime = this.trimStart
        }
        this.videoEl.play().catch(() => { /* interrupted — ignore */ })
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
      if (t >= this.trimEnd) { this.videoEl.pause(); this.videoEl.currentTime = this.trimEnd }
      this.timeline.setPlayhead(t)
      this._updateTimeDisplay()
    })
  }

  private _bindToolbar(): void {
    document.querySelectorAll<HTMLElement>('.tool-btn[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset['tool'] as Tool | undefined
        if (tool) this._setActiveTool(tool)
      })
    })

    // Crop presets
    document.querySelectorAll<HTMLElement>('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll<HTMLElement>('.preset-btn').forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')
        this.crop.setPreset(btn.dataset['preset'] as AspectPreset)
      })
    })

    // Speed slider
    const speedSlider = el<HTMLInputElement>('speed-slider')
    const speedValue  = el('speed-value')
    speedSlider.addEventListener('input', () => {
      this.speed = parseFloat(speedSlider.value)
      speedValue.textContent = `${this.speed}×`
      this.videoEl.playbackRate = this.speed
    })

    // Rotate / flip buttons
    el('btn-rotate-ccw').addEventListener('click', () => {
      this.rotation = ((this.rotation + 270) % 360) as Rotation
      this._updateVideoTransform()
    })
    el('btn-rotate-cw').addEventListener('click', () => {
      this.rotation = ((this.rotation + 90) % 360) as Rotation
      this._updateVideoTransform()
    })
    el('btn-flip-h').addEventListener('click', () => {
      this.flipH = !this.flipH
      el('btn-flip-h').classList.toggle('active', this.flipH)
      this._updateVideoTransform()
    })
    el('btn-flip-v').addEventListener('click', () => {
      this.flipV = !this.flipV
      el('btn-flip-v').classList.toggle('active', this.flipV)
      this._updateVideoTransform()
    })
    el('btn-rotate-reset').addEventListener('click', () => {
      this.rotation = 0; this.flipH = false; this.flipV = false
      el('btn-flip-h').classList.remove('active')
      el('btn-flip-v').classList.remove('active')
      this._updateVideoTransform()
    })

    // Overlay file picker
    const overlayInput = el<HTMLInputElement>('overlay-input')
    overlayInput.addEventListener('change', () => {
      const file = overlayInput.files?.[0]
      if (file) {
        this.imgOverlay.load(file)
        el('btn-overlay-remove').hidden = false
      }
      overlayInput.value = ''  // reset so same file can be re-picked
    })

    // Opacity slider
    const opacitySlider = el<HTMLInputElement>('overlay-opacity')
    const opacityValue  = el('overlay-opacity-value')
    opacitySlider.addEventListener('input', () => {
      const v = parseInt(opacitySlider.value) / 100
      this.imgOverlay.setOpacity(v)
      opacityValue.textContent = `${opacitySlider.value}%`
    })

    // Remove overlay
    el('btn-overlay-remove').addEventListener('click', () => {
      this.imgOverlay.unload()
      el('btn-overlay-remove').hidden = true
      opacitySlider.value = '100'
      opacityValue.textContent = '100%'
    })
  }

  private _setActiveTool(tool: Tool): void {
    document.querySelectorAll<HTMLElement>('.tool-btn[data-tool]').forEach((b) =>
      b.classList.toggle('active', b.dataset['tool'] === tool)
    )

    document.querySelectorAll<HTMLElement>('.tool-panel').forEach((p) => { p.hidden = true })

    if (tool === 'crop') {
      el('panel-crop').hidden = false
      this.crop.show()
    } else {
      this.crop.hide()
    }

    if (tool === 'rotate') {
      el('panel-rotate').hidden = false
    } else if (tool === 'speed') {
      el('panel-speed').hidden = false
    } else if (tool === 'mute-audio') {
      this.muteAudio = !this.muteAudio
      const muteBtn = document.querySelector<HTMLElement>('[data-tool="mute-audio"]')
      if (muteBtn) muteBtn.style.color = this.muteAudio ? 'var(--danger)' : ''
    } else if (tool === 'overlay') {
      el('panel-overlay').hidden = false
      // Auto-open file picker if no image loaded yet
      if (!this.imgOverlay.visible) el<HTMLInputElement>('overlay-input').click()
    }
  }

  private _bindExport(): void {
    el('btn-export').addEventListener('click', () => { void this._export() })
  }

  private async _export(): Promise<void> {
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
      const outputFilename = 'edited-' + this.file.name.replace(/\.[^.]+$/, '') + '.mp4'
      const hasOverlay = this.imgOverlay.visible && this.imgOverlay.file !== null

      await ff.writeFile(inputName, await fetchFile(this.file))
      if (hasOverlay) {
        await ff.writeFile('overlay.png', await fetchFile(this.imgOverlay.file!))
      }

      const args = ['-i', inputName]
      if (hasOverlay) args.push('-i', 'overlay.png')

      args.push('-ss', this.trimStart.toFixed(3), '-t', (this.trimEnd - this.trimStart).toFixed(3))

      // Video filter chain (crop → speed)
      const vfFilters: string[] = []
      if (this.crop.visible) {
        const c = this.crop.toPixels()
        vfFilters.push(`crop=${c.w}:${c.h}:${c.x}:${c.y}`)
      }
      vfFilters.push(...this._buildRotateFlipFilters())
      if (this.speed !== 1) {
        vfFilters.push(`setpts=${(1 / this.speed).toFixed(4)}*PTS`)
      }

      if (hasOverlay) {
        // Use filter_complex to composite overlay onto the (optionally filtered) video
        const ov = this.imgOverlay.toPixels(this.videoEl.videoWidth, this.videoEl.videoHeight)
        const filterParts: string[] = []
        if (vfFilters.length > 0) {
          filterParts.push(`[0:v]${vfFilters.join(',')}[base]`)
        }
        // Scale overlay; use lut to scale alpha for opacity < 1 (preserves PNG transparency)
        const ovFilters = [`scale=${ov.w}:${ov.h}`, 'format=rgba']
        if (ov.opacity < 1) ovFilters.push(`lut=a='val*${ov.opacity.toFixed(4)}'`)
        filterParts.push(`[1:v]${ovFilters.join(',')}[ov]`)
        const base = vfFilters.length > 0 ? '[base]' : '[0:v]'
        filterParts.push(`${base}[ov]overlay=${ov.x}:${ov.y}[vout]`)
        args.push('-filter_complex', filterParts.join(';'))
        args.push('-map', '[vout]')
        if (!this.muteAudio) args.push('-map', '0:a?')
      } else {
        if (vfFilters.length > 0) args.push('-vf', vfFilters.join(','))
      }

      // Audio
      if (this.speed !== 1 && !this.muteAudio) {
        args.push('-af', buildAtempo(this.speed).map((v) => `atempo=${v}`).join(','))
      }
      if (this.muteAudio) args.push('-an')

      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23')
      if (!this.muteAudio) args.push('-c:a', 'aac')
      args.push(outputName)

      await ff.exec(args)

      const raw = await ff.readFile(outputName)
      if (!(raw instanceof Uint8Array)) throw new Error('Expected binary output from FFmpeg')
      const blob = new Blob([new Uint8Array(raw)], { type: 'video/mp4' })

      const shareFile = new File([blob], outputFilename, { type: 'video/mp4' })
      if (navigator.canShare?.({ files: [shareFile] })) {
        await navigator.share({ files: [shareFile] }).catch(() => { /* dismissed */ })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = outputFilename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
      if (hasOverlay) await ff.deleteFile('overlay.png')
    } catch (err) {
      console.error(err)
      alert('Export failed. See console for details.')
    } finally {
      this._hideProcessing()
    }
  }

  private _updateVideoTransform(): void {
    const sx = this.flipH ? -1 : 1
    const sy = this.flipV ? -1 : 1
    this.videoEl.style.transform = `rotate(${this.rotation}deg) scaleX(${sx}) scaleY(${sy})`
  }

  private _buildRotateFlipFilters(): string[] {
    const filters: string[] = []
    if (this.rotation === 90)       filters.push('transpose=1')
    else if (this.rotation === 180) { filters.push('vflip'); filters.push('hflip') }
    else if (this.rotation === 270) filters.push('transpose=2')
    if (this.flipH) filters.push('hflip')
    if (this.flipV) filters.push('vflip')
    return filters
  }

  private _showProcessing(label: string): void {
    this.processingLabel.textContent = label
    this.progressBar.style.width = '0%'
    this.processingEl.hidden = false
  }

  private _hideProcessing(): void {
    this.processingEl.hidden = true
  }

  private _updateTimeDisplay(): void {
    const fmt = (s: number): string => {
      const m = Math.floor(s / 60)
      const sec = Math.floor(s % 60).toString().padStart(2, '0')
      return `${m}:${sec}`
    }
    this.timeDisplay.textContent =
      `${fmt(this.videoEl.currentTime)} / ${fmt(this.videoEl.duration || 0)}`
  }
}

/** Build atempo filter chain — each value must be in [0.5, 2] */
function buildAtempo(speed: number): number[] {
  const result: number[] = []
  let remaining = speed
  while (remaining > 2) { result.push(2); remaining /= 2 }
  while (remaining < 0.5) { result.push(0.5); remaining /= 0.5 }
  result.push(parseFloat(remaining.toFixed(4)))
  return result
}
