/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  // FFmpeg.wasm needs SharedArrayBuffer, which requires COOP/COEP headers
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  test: {
    // Pure function tests — no browser or DOM needed
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
