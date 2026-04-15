// ═══════════════════════════════════════════════════════════
// @niscorp/nova/react — React adapter
//
// Public surface for consumers who want to render nova layouts
// via React. Framework-agnostic core still lives at
// `@niscorp/nova`; this module only adds React-specific glue.
// ═══════════════════════════════════════════════════════════

export type {
  NovaComponent,
  NovaComponentProps,
  NovaModelBinding,
  NovaDispatch,
  NovaPublish,
} from './types';

export type { NovaRenderContextValue } from './context';

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

// ─── High-level mountable components ───────────────────────
// Most consumers only need these three. The primitives above
// exist for custom composition.
export {
  Nova,
  NovaLayout,
  NovaShell,
  NovaCanvas,
  type NovaLayoutProps,
  type NovaShellProps,
  type NovaCanvasProps,
} from './nova';

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
} from './hooks';
