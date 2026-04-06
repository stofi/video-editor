/**
 * Timeline: waveform canvas + trim handle drag (touch & mouse).
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

  setPlayhead(currentTime: number): void {
    if (!this.duration) return
    const pct = (currentTime / this.duration) * 100
    this.playhead.style.left = `${pct}%`
  }

  drawWaveform(audioBuffer: AudioBuffer): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = this.canvas.getBoundingClientRect()
    this.canvas.width = width * devicePixelRatio
    this.canvas.height = height * devicePixelRatio
    ctx.scale(devicePixelRatio, devicePixelRatio)

    const data = audioBuffer.getChannelData(0)
    const step = Math.ceil(data.length / width)
    const mid = height / 2

    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.7

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

  drawFlatWaveform(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = this.canvas.getBoundingClientRect()
    this.canvas.width = width * devicePixelRatio
    this.canvas.height = height * devicePixelRatio
    ctx.scale(devicePixelRatio, devicePixelRatio)
    ctx.clearRect(0, 0, width, height)
    ctx.strokeStyle = '#3b82f6'
    ctx.globalAlpha = 0.4
    ctx.lineWidth = 1
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
