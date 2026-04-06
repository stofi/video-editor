# Svelte 5 / SvelteKit Reference Projects

## Official
- **sveltejs/kit** — canonical SvelteKit source + docs site
- **sveltejs/learn.svelte.dev** — interactive tutorial (CodeMirror + MDsveX integration)
- **sveltejs/examples** — minimal focused examples (auth, forms, routing, edge)
- **sveltejs/realworld** — full-stack CRUD reference app

## Component Libraries
- **huntabyte/bits-ui** ★3.2k — headless Svelte 5 primitives, ARIA, builder pattern, TS throughout
- **huntabyte/shadcn-svelte** — copy-paste component pattern, $props() destructuring, Tailwind CVA
- **svecosystem/runed** ★1.8k — VueUse equivalent for Svelte 5, `.svelte.ts` reactive modules
- **skeletonlabs/skeleton** — full UI toolkit, Vitest/jsdom test setup

## Large Production Apps
- **gitbutlerapp/gitbutler** ★20k — Tauri + Svelte 5 desktop app, monorepo, best large-scale ref
- **immich-app/immich** — SvelteKit + TS + Tailwind, extracted `@immich/ui` component library
- **open-webui/open-webui** — AI chat, streaming SSE, complex reactive state at scale
- **coollabsio/coolify** — SvelteKit, i18n, real-time deployment UIs

## Creative / Interactive
- **threlte/threlte** ★3.1k — Three.js for Svelte, wrapping imperative APIs declaratively
- **open-source-labs/Svelvet** — node-based flowchart UI, canvas-coord drag patterns
- **huntabyte/paneforge** — resizable pane drag/resize patterns (relevant to editor UIs)

## Small Pattern References
- **huntabyte/svelte-5-context-classes** — canonical: class + $state + setContext/getContext
- **ivanhofer/sveltekit-typescript-showcase** — typed load functions, typed form actions

## Key Svelte 5 Patterns

### Reactive class state
```typescript
class EditorState {
  trimStart = $state(0)
  trimEnd = $state(0)
  speed = $state(1)
  duration = $derived(this.trimEnd - this.trimStart)
}
```

### Context + class (no prop drilling)
```typescript
// parent component
const editor = setContext('editor', new EditorState())
// any descendant
const editor = getContext<EditorState>('editor')
```

### .svelte.ts reactive modules (reactivity outside components)
```typescript
// timeline.svelte.ts
export function createTimeline() {
  let trimStart = $state(0)
  let trimEnd = $state(10)
  return { get trimStart() { return trimStart }, setTrim(s, e) { trimStart = s; trimEnd = e } }
}
```

### Snippets replacing named slots
```svelte
{#snippet header()}<h1>Title</h1>{/snippet}
{@render header()}
```

## Migration relevance for this project
- `editor.ts` class → `.svelte.ts` reactive class (keep same structure, add $state)
- `timeline.ts` class → `.svelte.ts` with $state for trimStart/trimEnd/duration
- `crop.ts` / `overlay.ts` → Svelte components replacing imperative DOM manipulation
- Threlte patterns show how to wrap imperative canvas/DOM APIs in Svelte's model
- PaneForge shows drag-handle patterns directly applicable to trim handles
