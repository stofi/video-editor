/**
 * Draggable text overlay for preview and canvas-based FFmpeg export.
 * Text is rendered to a transparent canvas (system font) and composited
 * via filter_complex overlay=0:0 — no font file required.
 */

function videoContentRect(videoEl: HTMLVideoElement): DOMRect {
  const c = videoEl.getBoundingClientRect()
  const ar = (videoEl.videoWidth || 1) / (videoEl.videoHeight || 1)
  const ca = c.width / c.height
  let w: number, h: number
  if (ar > ca) { w = c.width;  h = c.width / ar  }
  else         { h = c.height; w = c.height * ar }
  return new DOMRect(c.left + (c.width - w) / 2, c.top + (c.height - h) / 2, w, h)
}

export class TextOverlay {
  visible = false
  text = ''
  /** Font size as fraction of video height (0.03–0.20) */
  fontSize = 0.07
  color = '#ffffff'
  /** Position normalized to video content area (0–1) */
  x = 0.5
  y = 0.08

  private readonly container: HTMLElement
  private readonly videoEl: HTMLVideoElement
  private readonly wrap: HTMLDivElement
  private readonly textEl: HTMLDivElement

  private dragging = false
  private ox = 0; private oy = 0; private onx = 0; private ony = 0

  constructor(container: HTMLElement, videoEl: HTMLVideoElement) {
    this.container = container
    this.videoEl = videoEl

    this.wrap = document.createElement('div')
    this.wrap.className = 'text-overlay-wrap'

    this.textEl = document.createElement('div')
    this.textEl.className = 'text-overlay-el'
    this.textEl.style.display = 'none'
    this.wrap.appendChild(this.textEl)
    container.appendChild(this.wrap)

    this.textEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      this.dragging = true
      this.ox = e.clientX; this.oy = e.clientY
      this.onx = this.x;   this.ony = this.y
      this.textEl.setPointerCapture(e.pointerId)
    })
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return
      const r = videoContentRect(this.videoEl)
      this.x = Math.max(0, Math.min(1, this.onx + (e.clientX - this.ox) / r.width))
      this.y = Math.max(0, Math.min(1, this.ony + (e.clientY - this.oy) / r.height))
      this._reposition()
    })
    window.addEventListener('pointerup', () => { this.dragging = false })

    new ResizeObserver(() => { if (this.visible) this._reposition() }).observe(container)
  }

  show(): void {
    this.visible = true
    this.wrap.style.display = 'block'
    if (this.text) { this.textEl.style.display = 'block'; this._reposition() }
  }

  hide(): void {
    this.visible = false
    this.wrap.style.display = 'none'
  }

  setText(t: string): void {
    this.text = t
    this.textEl.textContent = t
    this.textEl.style.display = t ? 'block' : 'none'
    if (t) this._reposition()
  }

  setFontSize(f: number): void { this.fontSize = f; this._reposition() }
  setColor(c: string): void    { this.color = c; this.textEl.style.color = c }

  /**
   * Render text to a transparent canvas of size videoW×videoH.
   * Uses system sans-serif — no external font file needed.
   */
  toCanvas(videoW: number, videoH: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = videoW; canvas.height = videoH
    if (!this.text.trim()) return canvas
    const ctx = canvas.getContext('2d')!
    const fontPx = Math.round(this.fontSize * videoH)
    ctx.font = `bold ${fontPx}px sans-serif`
    ctx.fillStyle = this.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'rgba(0,0,0,0.7)'
    ctx.shadowBlur = fontPx * 0.15
    ctx.fillText(this.text, Math.round(this.x * videoW), Math.round(this.y * videoH))
    return canvas
  }

  private _reposition(): void {
    if (!this.visible || !this.text) return
    const r = videoContentRect(this.videoEl)
    const p = this.container.getBoundingClientRect()
    const fontPx = this.fontSize * r.height
    this.textEl.style.fontSize = `${fontPx}px`
    this.textEl.style.color = this.color
    this.textEl.style.left = `${r.left - p.left + this.x * r.width}px`
    this.textEl.style.top  = `${r.top  - p.top  + this.y * r.height}px`
  }
}
