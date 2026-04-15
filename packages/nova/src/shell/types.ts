import type {
  ActionDefinition,
  ActionInstance,
  FetchFn,
  OnErrorHandler,
  PublicActionRuntime,
  TransformFn,
} from '../action';
import type { ComponentRegistry, LayoutNode, LayoutStore, RenderNode } from '../layout';
import type { Unsubscribe } from '../shared/common';
import type { EventBus, NovaEvent } from '../shared/event-bus';
import type { MessageBus } from '../shared/message-bus';
import type { IdFactory } from '../shared/ids';

// ═══════════════════════════════════════════════════════════
// Canvas
// ═══════════════════════════════════════════════════════════

export type CanvasConfig = {
  id: string;
  // Layout describing how this canvas arranges its action instances.
  // Either an inline LayoutNode or a LayoutStore id. When omitted, the
  // canvas renders only the top-of-stack (card-deck) action.
  // Data scope available to resolvables: { instances, active, count }.
  actionLayout?: LayoutNode | string;
};

export type CanvasState = {
  id: string;
  stack: ActionInstance[];
  active: ActionInstance | undefined;
};

// ═══════════════════════════════════════════════════════════
// Telemetry
// ═══════════════════════════════════════════════════════════

export type StateSnapshot = {
  canvases: Record<string, CanvasState>;
};

export type DataChangeEvent = {
  instanceId: string;
  canvasId: string;
  data: Record<string, unknown>;
};

export type StateChangeHandler = (snapshot: StateSnapshot) => void;
export type DataChangeHandler = (change: DataChangeEvent) => void;

// ═══════════════════════════════════════════════════════════
// Shell config + interface
// ═══════════════════════════════════════════════════════════

export type ShellTelemetry = {
  onStateChange?: StateChangeHandler;
  onDataChange?: DataChangeHandler;
};

export type ShellConfig = {
  canvases: CanvasConfig[];
  // Layout describing how the shell arranges its canvases. Either an
  // inline LayoutNode or a LayoutStore id. When omitted, canvases are
  // rendered in a single flex row in declaration order.
  // Data scope available to resolvables: { canvases }.
  canvasLayout?: LayoutNode | string;
  registry: ComponentRegistry;
  layoutStore: LayoutStore;
  actions: Record<string, ActionDefinition>;
  transform?: TransformFn;
  fetch?: FetchFn;
  telemetry?: ShellTelemetry;
  strict?: boolean;
  onError?: OnErrorHandler;
  shellIdFn?: IdFactory;
  instanceIdFn?: IdFactory;
  // Optional injection — primarily for tests that need to drive ui:model or
  // other events into the shell. Defaults to fresh per-shell buses.
  eventBus?: EventBus;
  messageBus?: MessageBus;
};

export type Shell = {
  readonly id: string;

  push: (canvasId: string, actionId: string, input?: Record<string, unknown>) => string;
  pop: (canvasId: string) => void;
  replace: (canvasId: string, actionId: string, input?: Record<string, unknown>) => string;
  clear: (canvasId: string) => void;

  getCanvasState: (canvasId: string) => CanvasState;
  getRuntime: (instanceId: string) => PublicActionRuntime | undefined;
  getState: () => StateSnapshot;

  // Render the shell's canvasLayout against a synthetic scope exposing
  // all canvases. Slot components (CanvasSlot) inside the layout recurse
  // into per-canvas rendering.
  getShellRenderTree: () => RenderNode[];

  // Render a canvas's actionLayout against a synthetic scope exposing
  // the canvas's stack + active. Slot components (ActionSlot) inside the
  // layout recurse into per-instance rendering.
  getCanvasRenderTree: (canvasId: string) => RenderNode[];

  // Expand slot markers (CanvasSlot / ActionSlot) in a render tree into
  // their fully resolved content. Used by non-React consumers
  // (evaluators, exporters, tests) that need a materialised tree.
  // React consumers render trees through component boundaries instead.
  flattenRenderTree: (tree: RenderNode[]) => RenderNode[];

  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;

  onStateChange: (handler: StateChangeHandler) => Unsubscribe;
  onDataChange: (handler: DataChangeHandler) => Unsubscribe;

  dispose: () => void;
};
