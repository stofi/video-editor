import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Fail fast — no flaky retries in this project
  retries: 0,
  // Run tests sequentially (Pi has limited CPU)
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:5173',
    // Capture screenshot on failure
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start the Vite dev server before running tests.
  // The dev server already sets COOP/COEP headers for SharedArrayBuffer.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
