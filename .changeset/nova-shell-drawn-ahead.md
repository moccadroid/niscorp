---
'@niscorp/nova': minor
'@niscorp/nisc': minor
---

A shell that lives in the page can arrive as markup.

- The shell-backed React hooks (`useShellState`, `useCanvas`, `useRenderTree`, `useCanvasRenderTree`, `useShellRenderTree`, `useActionData`, `useActionStatus`) and `<NovaShell>` draw under `react-dom/server` — each passes `useSyncExternalStore` a server snapshot — and `hydrateRoot` adopts that markup over a second boot of the same shell.
- `shellSettled(shell, { waitMs?, stopped? })` — resolves `true` once no instance is still mounting: the first screen is whole. `DEFAULT_SETTLE_WAIT_MS`.
- `shellView(shell)` — a local shell as a `RenderApi` plus a coalesced `subscribe`, so an adapter written against `RenderApi` draws a shell beside it. `canvasTreeOf` and `hasVisibleContent`: a canvas with nothing visible is `[]`, served or local.
- DOM adapter: `mountShell(root, registry, shell)`, and `renderToString(registry, api, { window })` at `@niscorp/nova/adapters/dom/server` (the host hands in a DOM).
