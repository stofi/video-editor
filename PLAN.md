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

## SvelteKit Migration Evaluation

### Findings

The codebase has reached a natural complexity ceiling for vanilla TS:

| Metric | Value | Problem |
|--------|-------|---------|
| `editor.ts` lines | 641 | God class — owns all tool state, all DOM bindings, export |
| Manual `el()` DOM queries in editor.ts | 43 | Every state change requires a manual DOM write |
| Tool panels hardcoded in index.html | 7 | No component abstraction; all panels share one flat HTML file |
| Global CSS lines | 605 | No scoping — naming collisions between panel styles are possible |

The **non-UI logic** (timeline.ts, crop.ts, overlay.ts, textoverlay.ts, ffmpeg.ts, utils.ts)
is framework-agnostic and can move unchanged into a SvelteKit project.
Only `index.html`, `editor.ts`, `main.ts`, and `style.css` require rewriting.

### What SvelteKit buys

1. **Components** — each tool panel becomes its own `.svelte` file
   (`TrimPanel.svelte`, `SpeedPanel.svelte`, `OverlayPanel.svelte`, …) with
   colocated markup, scoped CSS, and logic. The 43 `el()` calls disappear.
2. **Svelte 5 `$state` runes** — reactive class fields replace manual DOM updates;
   `trimStart = x` re-renders everything that depends on it automatically.
3. **Scoped CSS** — each component owns its styles; global `style.css` shrinks
   to design tokens and layout only.
4. **Better DX** — adding a new tool is one new `.svelte` file, not edits across
   `index.html`, `editor.ts`, and `style.css` simultaneously.

### Migration scope

- ~15–20 `.svelte` components replace `index.html` + `editor.ts` + `main.ts`
- Existing business-logic modules stay as-is (they are plain TS classes)
- The Vite config (COOP/COEP headers) works unchanged with SvelteKit
- The Playwright + Vitest test suite provides regression safety throughout

### Recommendation

**Migrate — but as a planned rewrite, not incremental patching.**

The vanilla approach is maintainable for the current feature set but each new
tool adds ~50–80 lines across three files. A SvelteKit rewrite would take roughly
1–2 weeks; the payoff is sustained productivity for future tools and long-term
maintainability.

Suggested order:
1. New branch: `feat/sveltekit`
2. `npm create svelte@latest` — Skeleton project, TypeScript, no extra integrations
3. Copy existing non-UI modules verbatim
4. Implement components top-down: `App.svelte` → `ImportScreen` → `EditorScreen`
   → one panel component at a time, validated by the E2E tests after each

## Deployment Notes

- Requires **HTTPS** in production (SharedArrayBuffer needs secure context)
- Must serve with headers:
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```
- Coolify: set these headers in the proxy config / Nginx template
- Static build: `pnpm build` → serve `dist/`
