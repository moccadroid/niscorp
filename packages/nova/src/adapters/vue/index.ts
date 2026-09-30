// ═══════════════════════════════════════════════════════════
// @niscorp/nova/adapters/vue — Vue 3 adapter
//
// Render functions in plain TS (no SFCs, no compiler step). The same contract
// as the React adapter (ADAPTER.md): a walker, provide/inject for registry /
// dispatch / publish, subscription composables, shell-backed slots. The
// primitive vocabulary ships at `@niscorp/nova/adapters/vue/components`.
// ═══════════════════════════════════════════════════════════

export type { NovaComponent, NovaComponentProps, NovaModelBinding, NovaDispatch, NovaPublish } from './types';
export { isNovaComponent } from './types';

export {
  NovaRenderKey,
  NovaShellKey,
  type NovaRenderContextValue,
  type NovaShellSource,
  type SlotWrapper,
  type SlotWrapperProps,
} from './context';

export {
  NovaRenderProvider,
  NovaShellProvider,
  type NovaRenderProviderProps,
  type NovaShellProviderProps,
} from './provider';

export { RenderTree, type RenderTreeProps } from './render-tree';
export { RenderNodeView, type RenderNodeViewProps } from './render-node';
export { ErrorMarker, type ErrorMarkerProps } from './error-marker';
export { NovaErrorBoundary, type NovaErrorBoundaryProps } from './error-boundary';

export { NovaShell, NovaCanvas, type NovaShellProps, type NovaCanvasProps } from './nova';

export {
  useShell,
  useShellState,
  useCanvas,
  useActionData,
  useActionStatus,
  useRenderTree,
  useShellRenderTree,
  useCanvasRenderTree,
  useNovaDispatch,
  useNovaPublish,
  useNovaRegistry,
  useSlotWrapper,
} from './composables';
