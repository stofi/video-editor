/**
 * Crop overlay — draggable crop rect with corner handles and aspect presets.
 * Positioned over the actual video content area (accounts for letterboxing).
 */

export interface CropRect {
  x: number  // normalized 0–1 relative to video pixel dimensions
  y: number
  w: number
  h: number
}

export type AspectPreset = 'free' | '16:9' | '9:16' | '1:1' | '4:3'

const ASPECT_RATIOS: Record<AspectPreset, number | null> = {
  free:  null,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1':  1,
  '4:3':  4 / 3,
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const MIN_SIZE = 0.05

export class CropOverlay {
  private readonly wrapEl: HTMLElement
  private readonly regionEl: HTMLElement

  private rect: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
  private aspectRatio: number | null = null
  private _visible = false

  // Drag state
  private dragMode: DragMode | null = null
  private startClientX = 0
  private startClientY = 0
  private startRect: CropRect = { x: 0, y: 0, w: 1, h: 1 }

  constructor(
    private readonly container: HTMLElement,
    private readonly video: HTMLVideoElement,
    private readonly onChange?: (rect: CropRect) => void,
  ) {
    this.wrapEl = document.createElement('div')
    this.wrapEl.className = 'crop-wrap'
    this.wrapEl.hidden = true

    this.regionEl = document.createElement('div')
    this.regionEl.className = 'crop-region'

    for (const corner of ['nw', 'ne', 'sw', 'se'] as const) {
      const h = document.createElement('div')
      h.className = 'crop-handle'
      h.dataset['corner'] = corner
      this.regionEl.appendChild(h)
    }

    this.wrapEl.appendChild(this.regionEl)
    this.container.appendChild(this.wrapEl)

    this._bindDrag()

    new ResizeObserver(() => { if (this._visible) this._positionWrap() })
      .observe(this.container)
  }

  get visible(): boolean { return this._visible }

  show(): void {
    this._visible = true
    this.wrapEl.hidden = false
    this._positionWrap()
    this._render()
  }

  hide(): void {
    this._visible = false
    this.wrapEl.hidden = true
  }

  setPreset(preset: AspectPreset): void {
    this.aspectRatio = ASPECT_RATIOS[preset]
    if (this.aspectRatio !== null) {
      this.rect = this._applyAspect(this.rect, this.aspectRatio)
    }
    this._render()
    this.onChange?.(this.rect)
  }

  getRect(): CropRect { return { ...this.rect } }

  /** Compute crop in video pixels (even-aligned for H.264 compatibility). */
  toPixels(): { x: number; y: number; w: number; h: number } {
    const vw = this.video.videoWidth
    const vh = this.video.videoHeight
    const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2)
    return {
      x: even(this.rect.x * vw),
      y: even(this.rect.y * vh),
      w: even(this.rect.w * vw),
      h: even(this.rect.h * vh),
    }
  }

  /** Position the wrap element over the actual video content area. */
  private _positionWrap(): void {
    const { x, y, w, h } = this._videoContentRect()
    Object.assign(this.wrapEl.style, {
      left:   `${x}px`,
      top:    `${y}px`,
      width:  `${w}px`,
      height: `${h}px`,
    })
  }

  /** Get the video content rect within the container (handles letterboxing). */
  private _videoContentRect(): { x: number; y: number; w: number; h: number } {
    const cw = this.container.clientWidth
    const ch = this.container.clientHeight
    if (!this.video.videoWidth || !this.video.videoHeight) {
      return { x: 0, y: 0, w: cw, h: ch }
    }
    const va = this.video.videoWidth / this.video.videoHeight
    const ca = cw / ch
    if (va > ca) {
      const h = cw / va
      return { x: 0, y: (ch - h) / 2, w: cw, h }
    } else {
      const w = ch * va
      return { x: (cw - w) / 2, y: 0, w, h: ch }
    }
  }

  private _render(): void {
    Object.assign(this.regionEl.style, {
      left:   `${this.rect.x * 100}%`,
      top:    `${this.rect.y * 100}%`,
      width:  `${this.rect.w * 100}%`,
      height: `${this.rect.h * 100}%`,
    })
  }

  private _applyAspect(r: CropRect, aspect: number): CropRect {
    let { x, y, w } = r
    let h = w / aspect
    if (h > 1) { h = 1; w = h * aspect }
    x = Math.max(0, Math.min(x, 1 - w))
    y = Math.max(0, Math.min(y, 1 - h))
    return { x, y, w, h }
  }

  private _clamp(r: CropRect): CropRect {
    let { x, y, w, h } = r
    w = Math.max(MIN_SIZE, w)
    h = Math.max(MIN_SIZE, h)
    x = Math.max(0, Math.min(x, 1 - w))
    y = Math.max(0, Math.min(y, 1 - h))
    w = Math.min(w, 1 - x)
    h = Math.min(h, 1 - y)
    return { x, y, w, h }
  }

  private _bindDrag(): void {
    const beginDrag = (mode: DragMode, cx: number, cy: number): void => {
      this.dragMode = mode
      this.startClientX = cx
      this.startClientY = cy
      this.startRect = { ...this.rect }
    }

    const moveDrag = (cx: number, cy: number): void => {
      if (!this.dragMode) return
      const ww = this.wrapEl.clientWidth
      const wh = this.wrapEl.clientHeight
      const dx = (cx - this.startClientX) / ww
      const dy = (cy - this.startClientY) / wh
      let { x, y, w, h } = this.startRect

      if (this.dragMode === 'move') {
        x += dx; y += dy
      } else {
        if (this.dragMode === 'nw') { x += dx; y += dy; w -= dx; h -= dy }
        if (this.dragMode === 'ne') {            y += dy; w += dx; h -= dy }
        if (this.dragMode === 'sw') { x += dx;           w -= dx; h += dy }
        if (this.dragMode === 'se') {                     w += dx; h += dy }

        if (this.aspectRatio !== null) {
          // Lock to aspect ratio using width as authority
          h = w / this.aspectRatio
          // Adjust origin for top handles
          if (this.dragMode === 'nw') { y = this.startRect.y + this.startRect.h - h }
          if (this.dragMode === 'ne') { y = this.startRect.y + this.startRect.h - h }
        }
      }

      this.rect = this._clamp({ x, y, w, h })
      this._render()
      this.onChange?.(this.rect)
    }

    const endDrag = (): void => { this.dragMode = null }

    // Region — move (not on a handle)
    this.regionEl.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).dataset['corner']) return
      e.preventDefault()
      beginDrag('move', e.clientX, e.clientY)
    })
    this.regionEl.addEventListener('touchstart', (e) => {
      if ((e.target as HTMLElement).dataset['corner']) return
      e.preventDefault()
      beginDrag('move', e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })

    // Corner handles
    this.regionEl.addEventListener('mousedown', (e) => {
      const corner = (e.target as HTMLElement).dataset['corner'] as DragMode | undefined
      if (!corner) return
      e.preventDefault()
      e.stopPropagation()
      beginDrag(corner, e.clientX, e.clientY)
    })
    this.regionEl.addEventListener('touchstart', (e) => {
      const corner = (e.target as HTMLElement).dataset['corner'] as DragMode | undefined
      if (!corner) return
      e.preventDefault()
      e.stopPropagation()
      beginDrag(corner, e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })

    // Global move / end
    window.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY))
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) moveDrag(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: true })
    window.addEventListener('touchend', endDrag, { passive: true })
    window.addEventListener('touchcancel', endDrag, { passive: true })
  }
}
