/**
 * PNG image overlay — drag to move, corner handle to resize.
 * Positioned over the actual video content area (letterbox-aware).
 */

export interface OverlayPixels {
  x: number
  y: number
  w: number
  h: number
  opacity: number
}

export class ImageOverlay {
  private readonly wrapEl: HTMLElement
  private readonly imgEl: HTMLImageElement
  private readonly resizeHandle: HTMLElement

  // Normalised coords relative to video dimensions (0–1)
  private x = 0.05
  private y = 0.05
  private scale = 0.3   // overlay width as fraction of video width
  private opacity = 1.0
  private naturalAspect = 1

  private _file: File | null = null
  private _visible = false

  // Drag state
  private dragMode: 'move' | 'resize' | null = null
  private startCX = 0
  private startCY = 0
  private startX = 0
  private startY = 0
  private startScale = 0

  constructor(
    private readonly container: HTMLElement,
    private readonly video: HTMLVideoElement,
    private readonly onChange?: () => void,
  ) {
    this.wrapEl = document.createElement('div')
    this.wrapEl.className = 'overlay-wrap'
    this.wrapEl.hidden = true

    this.imgEl = document.createElement('img')
    this.imgEl.className = 'overlay-img'
    this.imgEl.draggable = false
    this.imgEl.alt = ''

    this.resizeHandle = document.createElement('div')
    this.resizeHandle.className = 'overlay-resize-handle'

    this.imgEl.appendChild(this.resizeHandle)
    this.wrapEl.appendChild(this.imgEl)
    this.container.appendChild(this.wrapEl)

    this._bindDrag()

    new ResizeObserver(() => {
      if (this._visible) { this._positionWrap(); this._render() }
    }).observe(this.container)
  }

  get visible(): boolean { return this._visible }
  get file(): File | null { return this._file }
  get currentOpacity(): number { return this.opacity }

  load(file: File): void {
    this._file = file
    if (this.imgEl.src.startsWith('blob:')) URL.revokeObjectURL(this.imgEl.src)
    const url = URL.createObjectURL(file)
    this.imgEl.onload = () => {
      this.naturalAspect = this.imgEl.naturalWidth / this.imgEl.naturalHeight || 1
      this._visible = true
      this.wrapEl.hidden = false
      this._positionWrap()
      this._render()
      this.onChange?.()
    }
    this.imgEl.src = url
  }

  unload(): void {
    if (this.imgEl.src.startsWith('blob:')) URL.revokeObjectURL(this.imgEl.src)
    this._file = null
    this._visible = false
    this.wrapEl.hidden = true
    this.imgEl.src = ''
    this.onChange?.()
  }

  setOpacity(v: number): void {
    this.opacity = Math.max(0, Math.min(1, v))
    this.imgEl.style.opacity = String(this.opacity)
    this.onChange?.()
  }

  /** Returns args for FFmpeg filter_complex. Coords are in video pixels. */
  toPixels(videoW: number, videoH: number): OverlayPixels {
    const w = Math.max(2, Math.round(this.scale * videoW))
    const h = Math.max(2, Math.round(w / this.naturalAspect))
    const x = Math.round(this.x * videoW)
    const y = Math.round(this.y * videoH)
    return { x, y, w, h, opacity: this.opacity }
  }

  /** Video content rect within the container (accounts for letterboxing). */
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
    }
    const w = ch * va
    return { x: (cw - w) / 2, y: 0, w, h: ch }
  }

  private _positionWrap(): void {
    const { x, y, w, h } = this._videoContentRect()
    Object.assign(this.wrapEl.style, {
      left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`,
    })
  }

  private _render(): void {
    const ww = this.wrapEl.clientWidth || 1
    const wh = this.wrapEl.clientHeight || 1
    const displayW = this.scale * ww
    const displayH = displayW / this.naturalAspect

    // Clamp position so overlay stays within bounds
    const maxX = Math.max(0, 1 - displayW / ww)
    const maxY = Math.max(0, 1 - displayH / wh)
    this.x = Math.max(0, Math.min(this.x, maxX))
    this.y = Math.max(0, Math.min(this.y, maxY))

    Object.assign(this.imgEl.style, {
      left:   `${this.x * 100}%`,
      top:    `${this.y * 100}%`,
      width:  `${displayW}px`,
      height: `${displayH}px`,
    })
  }

  private _bindDrag(): void {
    const begin = (mode: 'move' | 'resize', cx: number, cy: number): void => {
      this.dragMode = mode
      this.startCX = cx
      this.startCY = cy
      this.startX = this.x
      this.startY = this.y
      this.startScale = this.scale
    }

    const move = (cx: number, cy: number): void => {
      if (!this.dragMode) return
      const ww = this.wrapEl.clientWidth || 1
      const wh = this.wrapEl.clientHeight || 1
      const dx = (cx - this.startCX) / ww
      const dy = (cy - this.startCY) / wh

      if (this.dragMode === 'move') {
        this.x = this.startX + dx
        this.y = this.startY + dy
      } else {
        // Diagonal drag: average of both axes so moving down-right naturally scales up
        this.scale = Math.max(0.05, Math.min(1, this.startScale + (dx + dy) / 2))
      }
      this._render()
      this.onChange?.()
    }

    const end = (): void => { this.dragMode = null }

    // Move — drag on img but not on resize handle
    this.imgEl.addEventListener('mousedown', (e) => {
      if (e.target === this.resizeHandle) return
      e.preventDefault()
      begin('move', e.clientX, e.clientY)
    })
    this.imgEl.addEventListener('touchstart', (e) => {
      if (e.target === this.resizeHandle) return
      e.preventDefault()
      begin('move', e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })

    // Resize — bottom-right handle
    this.resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation()
      begin('resize', e.clientX, e.clientY)
    })
    this.resizeHandle.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation()
      begin('resize', e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: false })

    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY))
    window.addEventListener('mouseup', end)
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    window.addEventListener('touchcancel', end, { passive: true })
  }
}
