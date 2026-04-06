import { test, expect } from '@playwright/test'
import path from 'path'

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/test.mp4')

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
    // Use Playwright's native file upload — triggers the real change event
    await page.locator('#file-input').setInputFiles(FIXTURE)
    // showEditor() runs synchronously before video decode, so active class
    // appears immediately even if the video is invalid/minimal
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
