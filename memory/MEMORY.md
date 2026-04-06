# Video Editor — Project Memory

## Stack
- Vite + vanilla TypeScript (strict), no framework
- @ffmpeg/ffmpeg v0.12 + @ffmpeg/util for WASM processing
- Mobile-first dark UI, touch-first

## Repo
- GitHub: https://github.com/stofi/video-editor (public)
- Branch: main
- Deployed on Coolify (Dockerfile build → nginx:alpine, port 80)

## Key constraints
- COOP/COEP headers required on every response (SharedArrayBuffer for FFmpeg.wasm)
- These are set in nginx.conf, baked into the Docker image
- HTTPS required in production (secure context for SharedArrayBuffer)

## Architecture
```
src/
  main.ts       File import + screen switching
  editor.ts     Core editor state, toolbar wiring, FFmpeg export
  ffmpeg.ts     Lazy FFmpeg singleton (loads ~30MB WASM on demand)
  timeline.ts   Waveform canvas + trim handle drag (touch + mouse)
  crop.ts       CropOverlay — drag/resize rect, aspect presets, letterbox compensation
  style.css     Mobile-first dark CSS (CSS custom properties)
  env.d.ts      vite/client ref, Window.webkitAudioContext ambient
```

## TypeScript config
- strict, noUnusedLocals, noUnusedParameters, noImplicitReturns, exactOptionalPropertyTypes
- tsconfig.json for src/, tsconfig.node.json (skipLibCheck) for vite.config.ts
- Run: `npx tsc --noEmit`

## FFmpeg export pipeline (editor.ts _export)
- Trim: -ss / -t
- Video filters (-vf): crop= then setpts= chained with comma
- Audio filters (-af): atempo chain (each value 0.5–2, chained for values outside range)
- Mute: -an
- Codec: libx264 ultrafast crf=23 + aac
- Output: Uint8Array → Blob → navigator.share (mobile) or anchor download (desktop)
- SharedArrayBuffer fix: wrap FFmpeg output in `new Uint8Array(raw)` before Blob

## Known patterns
- DOM helpers: `el<T>(id)` throws if element missing (fails fast)
- Drag state: per-class `dragMode` flag, single set of window listeners
- CropOverlay: letterbox compensation via _videoContentRect(), toPixels() rounds to even for H.264
- URL memory leak: revokeObjectURL on each new file load
- AudioContext: call .resume() before decodeAudioData (mobile suspend issue)
- video.play() rejection: always .catch() — iOS interrupts

## Deployment
- Dockerfile: node:22-alpine build → nginx:alpine serve
- nginx.conf: COOP/COEP headers, try_files SPA fallback, 1y cache on /assets/
- Coolify: Dockerfile build pack, port 80, HTTPS on
