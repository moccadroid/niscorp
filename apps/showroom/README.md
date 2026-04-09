# Nisc Showroom

A live demo + inspector app for Nisc packages (currently `@niscorp/nova`). Browse stories for components, layouts, and actions; see the source, the rendered output, and the live runtime data side by side.

## Two-terminal dev workflow

The showroom imports `@niscorp/nova` via the workspace `exports` map (the built `dist/`). To get live updates while editing nova source, run two terminals:

**Terminal 1 — nova watch build**

```bash
pnpm --filter @niscorp/nova dev
```

This runs `tsup --watch` and rebuilds nova's `dist/` whenever its source changes.

**Terminal 2 — vite dev server**

```bash
pnpm --filter showroom dev
```

Open http://localhost:5173.

If you only need a one-shot build of nova:

```bash
pnpm --filter @niscorp/nova build
```

## Adding a story

1. Create a new file under `src/stories/<kind>/<name>.ts` exporting a `Story` value.
2. Import + add it to the array in `src/stories.ts`.
3. The sidebar groups stories by kind and category automatically.

Story kinds: `component`, `layout`, `action`, `shell` (shell is a stub in phase 2).
