/**
 * Generates tests/fixtures/test.webm — a real 1-second 64×36 colour-sweep
 * video encoded by the browser's MediaRecorder (VP8/WebM).
 *
 * Run once:  npx tsx tests/generate-fixture.ts
 */
import { chromium } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const OUT = path.resolve(import.meta.dirname, 'fixtures/test.webm')

const browser = await chromium.launch()
const page = await browser.newPage()

// Pass as string so tsx doesn't mangle arrow-function names with __name()
const bytes: number[] = await page.evaluate(`(async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 36
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  const stream = canvas.captureStream(25)
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' })
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  await new Promise((resolve) => {
    recorder.onstop = () => resolve()
    recorder.start(100)
    let frame = 0
    const tick = () => {
      const hue = (frame / 25) * 360
      ctx.fillStyle = 'hsl(' + hue + ', 70%, 40%)'
      ctx.fillRect(0, 0, 64, 36)
      ctx.fillStyle = '#fff'
      ctx.font = '10px sans-serif'
      ctx.fillText(String(frame + 1), 4, 14)
      frame++
      if (frame < 25) setTimeout(tick, 40)
      else recorder.stop()
    }
    tick()
  })

  const blob = new Blob(chunks, { type: 'video/webm' })
  const buf = await blob.arrayBuffer()
  return Array.from(new Uint8Array(buf))
})()`)

await browser.close()

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, Buffer.from(bytes))
console.log(`Written ${bytes.length} bytes -> ${OUT}`)
