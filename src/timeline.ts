/**
 * Timeline: waveform canvas + thumbnail strip + trim handle drag (touch & mouse).
 */

type Handle = 'start' | 'end'

interface TimelineOptions {
  wrap: HTMLElement
  canvas: HTMLCanvasElement
  trimRegion: HTMLElement
  startHandle: HTMLElement
  endHandle: HTMLElement
  playhead: HTMLElement
  onTrimChange?: (start: number, end: number) => void
}

export class Timeline {
  private wrap: HTMLElement
  private canvas: HTMLCanvasElement
  private trimRegion: HTMLElement
  private startHandle: HTMLElement
  private endHandle: HTMLElement
  private playhead: HTMLElement
  private onTrimChange: ((start: number, end: number) => void) | undefined

  duration = 0
  trimStart = 0
  trimEnd = 0

  // Thumbnail strip state
  private thumbData: ImageData | null = null
  private thumbGeneration = 0

  // Last drawn waveform — re-composited after thumbnails arrive
  private lastAudioBuffer: AudioBuffer | null = null
  private hasWaveform = false

  constructor(opts: TimelineOptions) {
    this.wrap = opts.wrap
    this.canvas = opts.canvas
    this.trimRegion = opts.trimRegion
    this.startHandle = opts.startHandle
    this.endHandle = opts.endHandle
    this.playhead = opts.playhead
    this.onTrimChange = opts.onTrimChange

    this._bindHandles()
  }

  setDuration(duration: number): void {
    this.duration = duration
    this.trimStart = 0
    this.trimEnd = duration
    this._render()
  }

  setTrim(start: number, end: number): void {
    this.trimStart = Math.max(0, Math.min(start, this.duration))
    this.trimEnd   = Math.max(this.trimStart + 0.1, Math.min(end, this.duration))
    this._render()
    this.onTrimChange?.(this.trimStart, this.trimEnd)
  }

  setPlayhead(currentTime: number): void {
    if (!this.duration) return
    const pct = (currentTime / this.duration) * 100
    this.playhead.style.left = `${pct}%`
  }

  drawWaveform(audioBuffer: AudioBuffer): void {
    this.lastAudioBuffer = audioBuffer
    this.hasWaveform = true
    this._draw()
  }

  drawFlatWaveform(): void {
    this.lastAudioBuffer = null
    this.hasWaveform = false
    this._draw()
  }

  /**
   * Extract evenly-spaced frames from the video and render them as a thumbnail
   * strip behind the waveform. Runs asynchronously; a generation counter cancels
   * stale extractions when a new file is loaded.
   */
  async drawThumbnails(video: HTMLVideoElement): Promise<void> {
    if (!this.duration || !video.videoWidth || !video.videoHeight) return

    const myGen = ++this.thumbGeneration

    const { width, height } = this.canvas.getBoundingClientRect()
    if (!width || !height) return

    const dpr = devicePixelRatio
    const pw  = Math.round(width  * dpr)
    const ph  = Math.round(height * dpr)

    // Aim for roughly square thumbnails, minimum 4
    const count    = Math.max(4, Math.ceil(width / height))
    const thumbW   = pw / count
    const vAspect  = video.videoWidth / video.videoHeight
    const thumbH   = thumbW / vAspect
    const thumbY   = (ph - thumbH) / 2

    const wasPaused = video.paused
    const savedTime = video.currentTime
    if (!wasPaused) video.pause()

    // Draw frames onto a temp canvas so we don't disturb the live canvas
    const tmp    = document.createElement('canvas')
    tmp.width    = pw
    tmp.height   = ph
    const tmpCtx = tmp.getContext('2d')
    if (!tmpCtx) return

    for (let i = 0; i < count; i++) {
      if (myGen !== this.thumbGeneration) break  // cancelled by new file load

      video.currentTime = ((i + 0.5) / count) * this.duration
      await new Promise<void>((res) => {
        video.addEventListener('seeked', () => res(), { once: true })
      })

      if (myGen !== this.thumbGeneration) break

      // 1px gap between frames
      tmpCtx.drawImage(video, i * thumbW + 1, thumbY, thumbW - 2, thumbH)
    }

    if (myGen !== this.thumbGeneration) return

    this.thumbData = tmpCtx.getImageData(0, 0, pw, ph)

    // Restore video position
    video.currentTime = savedTime
    if (!wasPaused) video.play().catch(() => { /* ignore */ })

    // Re-draw waveform on top of the newly available thumbnails
    this._draw()
  }

  private _draw(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = this.canvas.getBoundingClientRect()
    if (!width || !height) return

    this.canvas.width  = Math.round(width  * devicePixelRatio)
    this.canvas.height = Math.round(height * devicePixelRatio)
    ctx.scale(devicePixelRatio, devicePixelRatio)

    ctx.clearRect(0, 0, width, height)

    // Thumbnail strip (putImageData ignores the current transform)
    const thumbFits = this.thumbData
      && this.thumbData.width  === this.canvas.width
      && this.thumbData.height === this.canvas.height

    if (thumbFits && this.thumbData) {
      ctx.putImageData(this.thumbData, 0, 0)
      // Dark scrim so the waveform stays legible
      ctx.fillStyle = 'rgba(10, 10, 20, 0.55)'
      ctx.fillRect(0, 0, width, height)
    }

    // Waveform
    if (this.hasWaveform && this.lastAudioBuffer) {
      this._drawWaveformData(ctx, width, height, this.lastAudioBuffer)
    } else {
      this._drawFlatLine(ctx, width, height)
    }
  }

  private _drawWaveformData(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    audioBuffer: AudioBuffer,
  ): void {
    const data = audioBuffer.getChannelData(0)
    const step = Math.ceil(data.length / width)
    const mid  = height / 2

    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth   = 1
    ctx.globalAlpha = this.thumbData ? 0.9 : 0.7

    for (let i = 0; i < width; i++) {
      let min = 1
      let max = -1
      for (let j = 0; j < step; j++) {
        const v = data[i * step + j] ?? 0
        if (v < min) min = v
        if (v > max) max = v
      }
      ctx.beginPath()
      ctx.moveTo(i, mid + min * mid * 0.9)
      ctx.lineTo(i, mid + max * mid * 0.9)
      ctx.stroke()
    }
  }

  private _drawFlatLine(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.strokeStyle = '#3b82f6'
    ctx.globalAlpha = this.thumbData ? 0.5 : 0.4
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
  }

  private _render(): void {
    if (!this.duration) return
    const startPct = (this.trimStart / this.duration) * 100
    const endPct   = (this.trimEnd   / this.duration) * 100
    this.trimRegion.style.left  = `${startPct}%`
    this.trimRegion.style.right = `${100 - endPct}%`
  }

  private _bindHandles(): void {
    this._bindHandle(this.startHandle, 'start')
    this._bindHandle(this.endHandle,   'end')
  }

  private _bindHandle(el: HTMLElement, which: Handle): void {
    let startX = 0
    let startPct = 0
    let dragging = false

    const onStart = (clientX: number): void => {
      dragging = true
      startX = clientX
      startPct = which === 'start'
        ? (this.trimStart / this.duration)
        : (this.trimEnd   / this.duration)
    }

    const onMove = (clientX: number): void => {
      if (!dragging || !this.duration) return
      const rect = this.wrap.getBoundingClientRect()
      const dx = clientX - startX
      const dpct = dx / rect.width
      let newPct = startPct + dpct

      if (which === 'start') {
        newPct = Math.max(0, Math.min(newPct, this.trimEnd / this.duration - 0.01))
        this.trimStart = newPct * this.duration
      } else {
        newPct = Math.max(this.trimStart / this.duration + 0.01, Math.min(newPct, 1))
        this.trimEnd = newPct * this.duration
      }

      this._render()
      this.onTrimChange?.(this.trimStart, this.trimEnd)
    }

    const onEnd = (): void => { dragging = false }

    // Touch
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(e.touches[0].clientX) }, { passive: false })
    window.addEventListener('touchmove', (e) => { if (e.touches.length === 1) onMove(e.touches[0].clientX) }, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })

    // Mouse
    el.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.clientX) })
    window.addEventListener('mousemove', (e) => { onMove(e.clientX) })
    window.addEventListener('mouseup', onEnd)
  }
}
