// ═══════════════════════════════════════════════════════════
// @niscorp/nova/adapters/ink — the full-screen terminal kit. Rides the React
// adapter's walker (`NovaRenderProvider` + `RenderTree` are pure react), so
// this subpath only adds the Ink-flavored component vocabulary: Tab cycles
// focus, Enter/Space activates, typing types. ESM-only, like ink itself.
// ═══════════════════════════════════════════════════════════

export { defaultRegistry } from './registry';
export { ActionSlot, Badge, Box, Row, Stack, Grid, Text, Button, Input, Checkbox, Table, Panel, JsonTree, fallback, TextWrap, ErrorMarker, useActionable } from './components';
export { CanvasMarkersContext, FrameControlsContext, useMarker, markerFocusId, Mark } from './markers';
export type { MarkerResolve, InkFrameControls } from './markers';
