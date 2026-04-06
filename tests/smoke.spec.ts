import { test, expect } from '@playwright/test'
import path from 'path'

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/test.webm')

test.describe('Import screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('shows import screen on load', async ({ page }) => {
    await expect(page.locator('#import-screen')).toBeVisible()
  })

  test('editor screen is hidden on load', async ({ page }) => {
    await expect(page.locator('#editor-screen')).not.toHaveClass(/\bactive\b/)
  })

  test('file input accepts video files', async ({ page }) => {
    await expect(page.locator('#file-input')).toHaveAttribute('accept', 'video/*')
  })

  test('import zone shows correct label', async ({ page }) => {
    await expect(page.locator('.import-label')).toContainText('video')
  })

  test('import zone shows privacy note', async ({ page }) => {
    await expect(page.locator('.import-sub')).toContainText('browser')
  })
})

test.describe('Editor UI structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#file-input').setInputFiles(FIXTURE)
    await expect(page.locator('#editor-screen')).toHaveClass(/\bactive\b/, { timeout: 3000 })
  })

  test('toolbar is visible', async ({ page }) => {
    await expect(page.locator('#toolbar')).toBeVisible()
  })

  test('all expected tool buttons are present', async ({ page }) => {
    for (const tool of ['trim', 'crop', 'speed', 'mute-audio', 'text', 'color', 'rotate', 'overlay']) {
      await expect(page.locator(`[data-tool="${tool}"]`)).toBeVisible()
    }
  })

  test('export button is present', async ({ page }) => {
    await expect(page.locator('#btn-export')).toBeVisible()
  })

  test('timeline is visible', async ({ page }) => {
    await expect(page.locator('#timeline-wrap')).toBeVisible()
  })

  test('playback controls are visible', async ({ page }) => {
    await expect(page.locator('#playback-controls')).toBeVisible()
    await expect(page.locator('#btn-play')).toBeVisible()
  })

  test('clicking a tool button shows its panel', async ({ page }) => {
    await page.locator('[data-tool="speed"]').click()
    await expect(page.locator('#panel-speed')).toBeVisible()
  })

  test('Escape key closes an open panel', async ({ page }) => {
    await page.locator('[data-tool="speed"]').click()
    await expect(page.locator('#panel-speed')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#panel-speed')).not.toBeVisible()
  })
})

test.describe('Video loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#file-input').setInputFiles(FIXTURE)
    await expect(page.locator('#editor-screen')).toHaveClass(/\bactive\b/, { timeout: 3000 })
    // Wait for video metadata — real fixture has valid frames so loadedmetadata fires
    await page.waitForFunction(
      () => (document.getElementById('preview-video') as HTMLVideoElement).readyState >= 1,
      { timeout: 5000 }
    )
  })

  test('video has non-zero duration after load', async ({ page }) => {
    const duration = await page.evaluate(
      () => (document.getElementById('preview-video') as HTMLVideoElement).duration
    )
    expect(duration).toBeGreaterThan(0)
  })

  test('time display is in a valid format after load', async ({ page }) => {
    const text = await page.locator('#time-display').textContent()
    // Must be "X:XX / X:XX" or "X:XX / --:--" — never "Infinity:NaN"
    expect(text).toMatch(/^\d+:\d{2} \/ (\d+:\d{2}|--:--)$/)
  })

  test('trim end input contains a valid number after load', async ({ page }) => {
    await page.locator('[data-tool="trim"]').click()
    const endVal = await page.locator('#trim-end-input').inputValue()
    // Value is a decimal like "1.0" or "0.0" — never empty or "Infinity"
    expect(endVal).toMatch(/^\d+\.\d+$/)
  })

  test('thumbnail canvas is non-empty after thumbnails render', async ({ page }) => {
    // Wait for at least one thumbnail to be drawn (non-zero pixel in the canvas)
    await page.waitForFunction(() => {
      const canvas = document.getElementById('waveform-canvas') as HTMLCanvasElement
      if (!canvas) return false
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      // Any non-zero pixel means something was drawn
      return data.some(v => v > 0)
    }, { timeout: 15000 })
  })
})
