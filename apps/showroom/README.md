# Nisc Showroom

A live demo + inspector app for the Nisc packages — one module per package (signal, solid, prism, charter, moss, vex, tide, strata, nova, cortex, loom). Browse stories for components, layouts, and actions; see the source, the rendered output, and the live runtime data side by side.

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

Each package is a module under `src/modules/<package>/`, registered in `src/app.tsx`. For nova:

1. Create `src/modules/nova/stories/<category>/<name>.story.ts` exporting a `story` value (its demo beside it as `<name>.demo.tsx`).
2. Import + add it to the array in `src/modules/nova/stories.ts`.
3. The sidebar groups stories by kind and category automatically.

Nova's story kinds: `layout`, `action`, `shell`, `i18n` (`src/modules/nova/story-types.ts`). Other modules declare their own kinds in their `index.ts` (`kindOrder`, `kindLabels`).

## Deployment

`.github/workflows/deploy-showroom.yml` builds the showroom and publishes it to GitHub Pages (under `/niscorp/`) after Verify passes on a push to `main`.
