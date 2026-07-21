# Terminal adapters — `adapters/tty` and `adapters/ink`

Two adapters render a served tree in a terminal. The TTY adapter is a pure
text renderer for line hosts (a REPL, a pipe, an agent); the Ink adapter is
a full-screen TUI kit riding the React adapter's walker. They share one
idea: every interactive carries a numbered `[n]` marker, and the numbering
is computed once (by the TTY walker) so `[7]` is the same interactive in
both. The shared adapter contract is [ADAPTER.md](ADAPTER.md); the host
that binds these to a live server is `@niscorp/moss` (`terminal/tty`,
`terminal/ink`).

---

## `@niscorp/nova/adapters/tty`

Pure functions — no framework, no I/O, no node builtins. Importable
anywhere.

### `createTtyView(registry, api, options?): TtyView`

- `registry: ComponentRegistry<TtyComponent>` — the kit.
- `api: TtyRenderApi` — core's `RenderApi` (`frame()`, `canvasTree(id)`,
  `dispatch(id, event)`, `publish(channel, payload?)`).
- `options.fallback?: TtyComponent` — renderer for unregistered names;
  omit for strict `COMPONENT_NOT_FOUND` markers.
- `view.render(): TtyFrame` — walk the current snapshot. Call on every
  host update; the view holds no state.

### `TtyFrame`

```ts
{ text: string; interactives: TtyInteractive[] }
```

`text` is the whole screen: one rule line per non-empty canvas
(`── main ───`), component lines below, blank runs collapsed. Empty
canvases collapse entirely.

### `TtyInteractive`

```ts
{ index, kind, ref, canvas, label, value?, path? }
```

- `index` — the printed `[n]`, 1-based, registration order.
- `kind` — `'click' | 'row' | 'model' | 'toggle'`. The host maps these to
  events: click/row → `ui:click` (payload `value`), toggle → `ui:model`
  with the negated boolean, model → the host's own input flow.
- `canvas` — whose dispatch this belongs to; `''` is frame chrome
  (dispatches nothing).
- `value` — click/row: the dispatch payload; model/toggle: the current
  value. `path` — the model path, display only.

The walker applies the conventions itself: any `ref`'d node gets a click
marker (payload = its `value` prop), any `model`'d node gets a model
marker (`toggle` when its current value is boolean). Components never
handle events; data-driven internals (a table's rows, a panel's `✕`)
register through `ctx.register`.

### `TtyComponent`

```ts
(ctx: { props; children: TtyBlock[]; register }) => TtyBlock   // TtyBlock = { lines: string[] }
```

Kit (`/adapters/tty/components`): `defaultRegistry()` with `Box, Row,
Stack, Grid, Text, Button, Input, Select, Textarea, Checkbox, Switch,
Table, Badge, Panel, JsonTree, ActionSlot`, plus `fallback` (unknown names
render their children; childless ones surface `label`/`title` + `count`)
and the line helpers (`stack`, `inline`, `pad`, `truncate`, …).

---

## `@niscorp/nova/adapters/ink`

An Ink component kit for the React adapter's walker — ESM-only, `ink` and
`ink-text-input` are optional peers. There is no separate walker: mount
`NovaRenderProvider` + `RenderTree` and register this kit.

### Host obligations

- Pass the three host leaf renderers to `NovaRenderProvider`: `fallback`
  (this kit's), `textWrapper` (`TextWrap` — ink forbids bare strings
  outside `<Text>`), `errorMarker` (`ErrorMarker` — the DOM default
  `<span>` crashes ink).
- For `[n]` markers, provide `CanvasMarkersContext` per canvas with a
  resolver `(ref, { value?, occurrence? }) => number | undefined` and
  provide `FrameControlsContext` at the root (`setTyping` — a focused
  input claims typed digits as text, so the host's number handling must
  stand down). Without providers the kit renders markerless and Tab-only.
- Marker identity: click-kinds resolve by `value` (a list's rows share one
  ref and differ by payload), model-kinds by `occurrence` (their value
  changes as you type). `markerFocusId(n)` is the ink focus id a marked
  component adopts — `useFocusManager().focus(markerFocusId(n))` jumps to
  it.

### Interaction conventions

Tab/Shift+Tab cycle ink's focus ring; Enter (or Space) activates; a
focused Input holds a local draft, honours `debounce`, submits `ui:key
Enter`, and forwards ↑/↓ to the server as `ui:key ArrowDown/ArrowUp` (a
served palette moves its own highlight). Typed-digit handling is the
host's job — the kit only displays markers and adopts their focus ids.

### Exports

`defaultRegistry()` — `Box, Row, Stack, Grid, Text, Button, Input, Select,
Textarea, Checkbox, Switch, Table, Badge, Panel, JsonTree, ActionSlot`;
`fallback` (ref'd unknowns are focusable and click on Enter); `TextWrap`,
`ErrorMarker`; `useActionable(novaRef, value)` — the full interactive
convention (marker + focus + Enter-click) for an app's own components;
`useMarker`, `Mark`, `markerFocusId`, `CanvasMarkersContext`,
`FrameControlsContext`.

Layout mapping: Grid honours `weights` (flex ratios) and `columns`
(wrapping tracks); Row honours `justify`/`align`; containers honour
`border` (incl. sided `'r'`/`'l'`/`'t'`/`'b'`), `padding`, `w`/`width`
(px→cells at ~8px/cell, percent passthrough), `grow`. What has no
terminal analog (bg, radius, drag) is absent, never faked.
