/**
 * Timeline: waveform canvas + trim handle drag (touch & mouse).
 */

export class Timeline {
  constructor({ wrap, canvas, trimRegion, startHandle, endHandle, playhead, onTrimChange }) {
    this.wrap = wrap
    this.canvas = canvas
    this.trimRegion = trimRegion
    this.startHandle = startHandle
    this.endHandle = endHandle
    this.playhead = playhead
    this.onTrimChange = onTrimChange

    this.duration = 0
    this.trimStart = 0   // seconds
    this.trimEnd = 0     // seconds

    this._bindHandles()
  }

  setDuration(duration) {
    this.duration = duration
    this.trimStart = 0
    this.trimEnd = duration
    this._render()
  }

  setPlayhead(currentTime) {
    if (!this.duration) return
    const pct = (currentTime / this.duration) * 100
    this.playhead.style.left = `${pct}%`
  }

  drawWaveform(audioBuffer) {
    const ctx = this.canvas.getContext('2d')
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
      let min = 1, max = -1
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

  drawFlatWaveform() {
    const ctx = this.canvas.getContext('2d')
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

  _render() {
    if (!this.duration) return
    const startPct = (this.trimStart / this.duration) * 100
    const endPct   = (this.trimEnd   / this.duration) * 100
    this.trimRegion.style.left  = `${startPct}%`
    this.trimRegion.style.right = `${100 - endPct}%`
  }

  _bindHandles() {
    this._bindHandle(this.startHandle, 'start')
    this._bindHandle(this.endHandle,   'end')
  }

  _bindHandle(el, which) {
    let startX = 0
    let startPct = 0

    const onStart = (clientX) => {
      startX = clientX
      startPct = which === 'start'
        ? (this.trimStart / this.duration)
        : (this.trimEnd   / this.duration)
    }

    const onMove = (clientX) => {
      if (!this.duration) return
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

    // Touch
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(e.touches[0].clientX) }, { passive: false })
    window.addEventListener('touchmove', (e) => { if (e.touches.length === 1) onMove(e.touches[0].clientX) }, { passive: true })

    // Mouse
    el.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.clientX) })
    window.addEventListener('mousemove', (e) => { if (e.buttons === 1) onMove(e.clientX) })
  }
}
