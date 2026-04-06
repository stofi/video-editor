/**
 * Core editor — wires up the video, timeline, toolbar, and FFmpeg export.
 */
import { getFFmpeg } from './ffmpeg.js'
import { Timeline } from './timeline.js'
import { CropOverlay, type AspectPreset } from './crop.js'
import { ImageOverlay } from './overlay.js'
import { TextOverlay } from './textoverlay.js'
import { fetchFile } from '@ffmpeg/util'
import { buildAtempo } from './utils.js'

type Tool = 'trim' | 'crop' | 'rotate' | 'color' | 'speed' | 'mute-audio' | 'overlay' | 'text'
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
  private readonly trimStartInput  = el<HTMLInputElement>('trim-start-input')
  private readonly trimEndInput    = el<HTMLInputElement>('trim-end-input')
  private readonly trimDurDisplay  = el('trim-dur-display')

  private speed = 1
  private muteAudio = false
  private trimStart = 0
  private trimEnd = 0
  private rotation: Rotation = 0
  private flipH = false
  private flipV = false
  private brightness = 0
  private contrast = 1
  private saturation = 1

  private readonly crop = new CropOverlay(
    el('preview-area'),
    el<HTMLVideoElement>('preview-video'),
  )

  private readonly overlays: ImageOverlay[] = []

  private readonly textOverlay = new TextOverlay(
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
    onTrimChange: (s, e) => { this.trimStart = s; this.trimEnd = e; this._updateTrimInputs() },
  })

  constructor() {
    this._bindPlayback()
    this._bindToolbar()
    this._bindExport()
    this._bindKeyboard()
  }

  async load(file: File): Promise<void> {
    this.file = file
    if (this._objectURL) URL.revokeObjectURL(this._objectURL)
    this._objectURL = URL.createObjectURL(file)
    this.videoEl.src = this._objectURL

    this.rotation = 0; this.flipH = false; this.flipV = false
    this.brightness = 0; this.contrast = 1; this.saturation = 1
    this._updateVideoTransform()
    this._updateVideoFilter()

    await new Promise<void>((res) => { this.videoEl.onloadedmetadata = () => res() })
    this.trimStart = 0
    this.trimEnd = this.videoEl.duration
    this.timeline.setDuration(this.videoEl.duration)
    this.trimStartInput.max = this.videoEl.duration.toFixed(1)
    this.trimEndInput.max   = this.videoEl.duration.toFixed(1)
    this._updateTrimInputs()
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

    // Trim inputs
    this.trimStartInput.addEventListener('change', () => {
      const v = parseFloat(this.trimStartInput.value)
      if (!isNaN(v)) this.timeline.setTrim(v, this.trimEnd)
    })
    this.trimEndInput.addEventListener('change', () => {
      const v = parseFloat(this.trimEndInput.value)
      if (!isNaN(v)) this.timeline.setTrim(this.trimStart, v)
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

    // Color sliders
    const brightnessSlider = el<HTMLInputElement>('color-brightness')
    const contrastSlider   = el<HTMLInputElement>('color-contrast')
    const saturationSlider = el<HTMLInputElement>('color-saturation')
    const brightnessVal = el('color-brightness-value')
    const contrastVal   = el('color-contrast-value')
    const saturationVal = el('color-saturation-value')
    const updateColor = () => {
      this.brightness = parseFloat(brightnessSlider.value)
      this.contrast   = parseFloat(contrastSlider.value)
      this.saturation = parseFloat(saturationSlider.value)
      brightnessVal.textContent = brightnessSlider.value
      contrastVal.textContent   = contrastSlider.value
      saturationVal.textContent = saturationSlider.value
      this._updateVideoFilter()
    }
    brightnessSlider.addEventListener('input', updateColor)
    contrastSlider.addEventListener('input', updateColor)
    saturationSlider.addEventListener('input', updateColor)
    el('btn-color-reset').addEventListener('click', () => {
      this.brightness = 0; this.contrast = 1; this.saturation = 1
      brightnessSlider.value = '0'; brightnessVal.textContent = '0'
      contrastSlider.value   = '1'; contrastVal.textContent   = '1'
      saturationSlider.value = '1'; saturationVal.textContent = '1'
      this._updateVideoFilter()
    })

    // Text overlay
    const textInput      = el<HTMLInputElement>('text-input')
    const textSizeSlider = el<HTMLInputElement>('text-size')
    const textSizeVal    = el('text-size-value')
    const textColorPick  = el<HTMLInputElement>('text-color')
    textInput.addEventListener('input', () => { this.textOverlay.setText(textInput.value) })
    textSizeSlider.addEventListener('input', () => {
      const pct = parseInt(textSizeSlider.value)
      textSizeVal.textContent = `${pct}%`
      this.textOverlay.setFontSize(pct / 100)
    })
    textColorPick.addEventListener('input', () => { this.textOverlay.setColor(textColorPick.value) })

    // Image overlay layers
    const overlayInput = el<HTMLInputElement>('overlay-input')
    el('btn-add-overlay').addEventListener('click', () => overlayInput.click())
    overlayInput.addEventListener('change', () => {
      const file = overlayInput.files?.[0]
      if (file) this._addOverlay(file)
      overlayInput.value = ''
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

    if (tool === 'trim') {
      el('panel-trim').hidden = false
    } else if (tool === 'rotate') {
      el('panel-rotate').hidden = false
    } else if (tool === 'color') {
      el('panel-color').hidden = false
    } else if (tool === 'speed') {
      el('panel-speed').hidden = false
    } else if (tool === 'mute-audio') {
      this.muteAudio = !this.muteAudio
      const muteBtn = document.querySelector<HTMLElement>('[data-tool="mute-audio"]')
      if (muteBtn) muteBtn.style.color = this.muteAudio ? 'var(--danger)' : ''
    } else if (tool === 'text') {
      el('panel-text').hidden = false
      this.textOverlay.show()
      el<HTMLInputElement>('text-input').focus()
    } else if (tool === 'overlay') {
      el('panel-overlay').hidden = false
    }
  }

  private _bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (!this.file) return
      const inInput = (e.target as HTMLElement).tagName === 'INPUT' ||
                      (e.target as HTMLElement).tagName === 'TEXTAREA'

      // Escape always closes the active panel, even from inputs
      if (e.key === 'Escape') {
        e.preventDefault()
        this._closeActiveTool()
        return
      }

      if (inInput) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          el('btn-play').click()
          break
        case 'j':
        case 'J':
          this.videoEl.currentTime = Math.max(this.trimStart, this.videoEl.currentTime - 5)
          this.timeline.setPlayhead(this.videoEl.currentTime)
          this._updateTimeDisplay()
          break
        case 'l':
        case 'L':
          this.videoEl.currentTime = Math.min(this.trimEnd, this.videoEl.currentTime + 5)
          this.timeline.setPlayhead(this.videoEl.currentTime)
          this._updateTimeDisplay()
          break
        case 'i':
        case 'I':
          this.timeline.setTrim(this.videoEl.currentTime, this.trimEnd)
          break
        case 'o':
        case 'O':
          this.timeline.setTrim(this.trimStart, this.videoEl.currentTime)
          break
      }
    })
  }

  private _closeActiveTool(): void {
    document.querySelectorAll<HTMLElement>('.tool-btn[data-tool]').forEach((b) =>
      b.classList.remove('active')
    )
    document.querySelectorAll<HTMLElement>('.tool-panel').forEach((p) => { p.hidden = true })
    this.crop.hide()
    this.textOverlay.hide()
  }

  private _bindExport(): void {
    el('btn-export').addEventListener('click', () => { void this._export() })
  }

  private async _export(): Promise<void> {
    if (!this.file) return

    this._showProcessing('Loading FFmpeg…', true)

    let ff
    try {
      ff = await getFFmpeg()
    } catch (err) {
      console.error(err)
      this._hideProcessing()
      alert('Failed to load FFmpeg. Check your browser supports SharedArrayBuffer (HTTPS required).')
      return
    }

    this._showProcessing('Encoding…')

    try {
      const inputName = 'input' + this.file.name.slice(this.file.name.lastIndexOf('.'))
      const outputName = 'output.mp4'
      const outputFilename = 'edited-' + this.file.name.replace(/\.[^.]+$/, '') + '.mp4'
      const activeOverlays = this.overlays.filter(ov => ov.visible && ov.file !== null)
      const hasText        = this.textOverlay.visible && this.textOverlay.text.trim() !== ''

      // Compute output dimensions (needed for text canvas sizing)
      let outW = this.videoEl.videoWidth
      let outH = this.videoEl.videoHeight
      if (this.crop.visible) { const c = this.crop.toPixels(); outW = c.w; outH = c.h }
      if (this.rotation === 90 || this.rotation === 270) { [outW, outH] = [outH, outW] }

      await ff.writeFile(inputName, await fetchFile(this.file))
      for (let i = 0; i < activeOverlays.length; i++) {
        await ff.writeFile(`overlay-${i}.png`, await fetchFile(activeOverlays[i].file!))
      }
      if (hasText) {
        const canvas = this.textOverlay.toCanvas(outW, outH)
        const pngBlob = await canvasToBlob(canvas)
        await ff.writeFile('text-overlay.png', new Uint8Array(await pngBlob.arrayBuffer()))
      }

      // Input seeking: place -ss BEFORE -i so FFmpeg fast-seeks to the nearest
      // keyframe rather than decoding the entire video from the start.
      const args: string[] = []
      if (this.trimStart > 0) args.push('-ss', this.trimStart.toFixed(3))
      args.push('-i', inputName)
      for (let i = 0; i < activeOverlays.length; i++) args.push('-i', `overlay-${i}.png`)
      if (hasText) args.push('-i', 'text-overlay.png')
      args.push('-t', (this.trimEnd - this.trimStart).toFixed(3))
      if (this.trimStart > 0) args.push('-avoid_negative_ts', 'make_zero')

      // Video filter chain: crop → rotate/flip → color → speed
      const vfFilters: string[] = []
      if (this.crop.visible) {
        const c = this.crop.toPixels()
        vfFilters.push(`crop=${c.w}:${c.h}:${c.x}:${c.y}`)
      }
      vfFilters.push(...this._buildRotateFlipFilters())
      vfFilters.push(...this._buildColorFilters())
      if (this.speed !== 1) {
        vfFilters.push(`setpts=${(1 / this.speed).toFixed(4)}*PTS`)
      }

      if (activeOverlays.length > 0 || hasText) {
        const filterParts: string[] = []
        let currentLabel = vfFilters.length > 0 ? '[base]' : '[0:v]'
        if (vfFilters.length > 0) filterParts.push(`[0:v]${vfFilters.join(',')}[base]`)

        // Chain each image overlay sequentially
        activeOverlays.forEach((ov, i) => {
          const px = ov.toPixels(this.videoEl.videoWidth, this.videoEl.videoHeight)
          const ovFilters = [`scale=${px.w}:${px.h}`, 'format=rgba']
          if (px.opacity < 1) ovFilters.push(`lut=a=val*${px.opacity.toFixed(4)}`)
          const isLast = i === activeOverlays.length - 1 && !hasText
          const outLabel = isLast ? '[vout]' : `[v${i + 1}]`
          filterParts.push(`[${i + 1}:v]${ovFilters.join(',')}[ov${i}]`)
          filterParts.push(`${currentLabel}[ov${i}]overlay=${px.x}:${px.y}${outLabel}`)
          currentLabel = outLabel
        })

        if (hasText) {
          const txtIdx = activeOverlays.length + 1
          filterParts.push(`[${txtIdx}:v]format=rgba[txt]`)
          filterParts.push(`${currentLabel}[txt]overlay=0:0[vout]`)
        }

        args.push('-filter_complex', filterParts.join(';'))
        args.push('-map', '[vout]')
        if (!this.muteAudio) args.push('-map', '0:a?')
      } else {
        // Explicit mapping makes audio optional — avoids errors on video-only inputs
        args.push('-map', '0:v:0', '-map', '0:a?')
        if (vfFilters.length > 0) args.push('-vf', vfFilters.join(','))
      }

      // Audio
      if (this.speed !== 1 && !this.muteAudio) {
        args.push('-af', buildAtempo(this.speed).map((v) => `atempo=${v}`).join(','))
      }
      if (this.muteAudio) args.push('-an')

      // Use stream copy when no video effects are applied (much faster than re-encoding)
      const needsVideoRecode = vfFilters.length > 0 || activeOverlays.length > 0 || hasText
      if (needsVideoRecode) {
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23')
      } else {
        args.push('-c:v', 'copy')
      }
      // Always encode audio to AAC — copying non-MP4-native codecs (PCM, FLAC,
      // Vorbis, etc.) into an MP4 container causes FFmpeg to exit with code 1.
      if (!this.muteAudio) {
        args.push('-c:a', 'aac', '-b:a', '128k')
      }
      args.push(outputName)

      // Capture FFmpeg log lines for readable error messages
      const logs: string[] = []
      const onLog = ({ message }: { message: string }): void => { logs.push(message) }
      const onProgress = ({ progress }: { progress: number }): void => {
        const pct = Math.min(100, Math.round(progress * 100))
        this.progressBar.style.width = `${pct}%`
        this.processingLabel.textContent = `Encoding… ${pct}%`
      }
      ff.on('log', onLog)
      ff.on('progress', onProgress)
      let exitCode = -1
      try {
        exitCode = await ff.exec(args)
      } finally {
        ff.off('progress', onProgress)
        ff.off('log', onLog)
      }
      if (exitCode !== 0) {
        const errLines = logs.filter(l => /error|invalid|failed|unable/i.test(l)).slice(-6).join('\n')
        console.error('FFmpeg args:', args)
        console.error('FFmpeg logs:', logs.join('\n'))
        throw new Error(`FFmpeg exited with code ${exitCode}${errLines ? `\n\n${errLines}` : ''}`)
      }

      this._showProcessing('Saving…')
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
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }

      await ff.deleteFile(inputName)
      await ff.deleteFile(outputName)
      for (let i = 0; i < activeOverlays.length; i++) await ff.deleteFile(`overlay-${i}.png`)
      if (hasText) await ff.deleteFile('text-overlay.png')
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

  private _updateVideoFilter(): void {
    const b = 1 + this.brightness
    const c = this.contrast
    const s = this.saturation
    this.videoEl.style.filter =
      b === 1 && c === 1 && s === 1 ? '' : `brightness(${b}) contrast(${c}) saturate(${s})`
  }

  private _buildColorFilters(): string[] {
    if (this.brightness === 0 && this.contrast === 1 && this.saturation === 1) return []
    return [`eq=brightness=${this.brightness.toFixed(3)}:contrast=${this.contrast.toFixed(3)}:saturation=${this.saturation.toFixed(3)}`]
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

  private _addOverlay(file: File): void {
    const ov = new ImageOverlay(el('preview-area'), this.videoEl)
    ov.load(file)
    this.overlays.push(ov)
    this._renderOverlayLayers()
  }

  private _removeOverlay(idx: number): void {
    this.overlays[idx]?.destroy()
    this.overlays.splice(idx, 1)
    this._renderOverlayLayers()
  }

  private _renderOverlayLayers(): void {
    const container = el('overlay-layers')
    container.innerHTML = ''
    this.overlays.forEach((ov, idx) => {
      const row = document.createElement('div')
      row.className = 'overlay-layer'

      const name = document.createElement('span')
      name.className = 'overlay-layer-name'
      name.textContent = ov.file?.name ?? `Layer ${idx + 1}`

      const range = document.createElement('input')
      range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'
      range.value = String(Math.round(ov.currentOpacity * 100))
      range.className = 'overlay-layer-opacity'
      range.addEventListener('input', () => ov.setOpacity(parseInt(range.value) / 100))

      const removeBtn = document.createElement('button')
      removeBtn.className = 'preset-btn danger'
      removeBtn.textContent = '✕'
      removeBtn.addEventListener('click', () => this._removeOverlay(idx))

      row.append(name, range, removeBtn)
      container.appendChild(row)
    })
  }

  private _showProcessing(label: string, indeterminate = false): void {
    this.processingLabel.textContent = label
    this.progressBar.style.width = indeterminate ? '' : '0%'
    this.progressBar.classList.toggle('indeterminate', indeterminate)
    this.processingEl.hidden = false
  }

  private _hideProcessing(): void {
    this.processingEl.hidden = true
  }

  private _updateTrimInputs(): void {
    this.trimStartInput.value = this.trimStart.toFixed(1)
    this.trimEndInput.value   = this.trimEnd.toFixed(1)
    const dur  = this.trimEnd - this.trimStart
    const m    = Math.floor(dur / 60)
    const sNum = dur % 60
    const sStr = `${Math.floor(sNum).toString().padStart(2, '0')}.${(sNum % 1).toFixed(1).slice(2)}`
    this.trimDurDisplay.textContent = `Clip: ${m}:${sStr}`
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

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png')
  })
}

