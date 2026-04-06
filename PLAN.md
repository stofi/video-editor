# Video Editor — Implementation Plan

> Browser-only, mobile-first video editor powered by FFmpeg.wasm.

## Architecture

```
index.html          Shell + screen layout
src/
  main.js           App entry — file import / screen switching
  editor.js         Core editor state + FFmpeg export orchestration
  ffmpeg.js         Lazy FFmpeg singleton loader
  timeline.js       Waveform canvas + trim handle drag (touch & mouse)
  style.css         Mobile-first dark UI
```

## Completed

- [x] Project scaffold (Vite + @ffmpeg/ffmpeg v0.12)
- [x] COOP/COEP headers for SharedArrayBuffer
- [x] Import screen (file picker + drag-and-drop)
- [x] Video preview with playback controls
- [x] Timeline with waveform rendering
- [x] Trim handles (touch + mouse drag)
- [x] Speed control (0.25×–4×)
- [x] Mute audio toggle
- [x] FFmpeg export (trim + speed + mute → MP4 download)

## Backlog / Next Steps

- [ ] Crop tool (aspect ratio presets + freeform drag on preview)
- [ ] Rotate / flip
- [ ] Text overlay (position + font size)
- [ ] Colour filters (brightness, contrast, saturation sliders)
- [ ] Multi-segment cuts (split at playhead, drag to reorder)
- [ ] Thumbnail strip on timeline (video frames)
- [ ] Zoom timeline (pinch-to-zoom)
- [ ] PWA manifest + offline support
- [ ] Share API integration (navigator.share) for mobile export
- [ ] Progress via FFmpeg log parsing (frame/fps based)

## Deployment Notes

- Requires **HTTPS** in production (SharedArrayBuffer needs secure context)
- Must serve with headers:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
- Coolify: set these headers in the proxy config / Nginx template
- Static build: `pnpm build` → serve `dist/`
