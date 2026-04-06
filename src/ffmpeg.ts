/**
 * Lazy-loaded FFmpeg singleton.
 * Only loads the ~30MB WASM core when first needed.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let instance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

const BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

export async function getFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
  if (instance) return instance

  if (!loadPromise) {
    loadPromise = (async () => {
      const ff = new FFmpeg()

      if (onProgress) {
        ff.on('progress', ({ progress }) => onProgress(progress))
      }

      ff.on('log', ({ message }) => {
        if (import.meta.env.DEV) console.debug('[ffmpeg]', message)
      })

      await ff.load({
        coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      })

      instance = ff
      return ff
    })()
  }

  return loadPromise
}

export function isLoaded(): boolean {
  return instance !== null
}
