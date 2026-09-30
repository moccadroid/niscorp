---
'@niscorp/nova': minor
---

`@niscorp/nova/adapters/vue` — a Vue 3 adapter (render functions, no SFC compiler): `NovaRenderProvider`, `RenderTree` / `RenderNodeView`, `NovaShellProvider`, `NovaShell`, `NovaCanvas`, `NovaErrorBoundary`, the injection keys and the composables (`useNovaDispatch`, `useShell`, `useCanvasRenderTree`, `useRenderTree`, …). `@niscorp/nova/adapters/vue/components` ships the primitive kit and `registerNovaVueComponents`. The primitives' props schemas now live once, shared by the React and Vue kits (the React exports are unchanged). `vue` is a new optional peer.
