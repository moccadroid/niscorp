import type {
  ActionDefinition,
  ActionInstance,
  FetchFn,
  OnErrorHandler,
  PublicActionRuntime,
  TransformFn,
} from '../action';
import type { ComponentRegistry, LayoutStore } from '../layout';
import type { Unsubscribe } from '../shared/common';
import type { EventBus, NovaEvent } from '../shared/event-bus';
import type { MessageBus } from '../shared/message-bus';
import type { IdFactory } from '../shared/ids';

// ═══════════════════════════════════════════════════════════
// Canvas
// ═══════════════════════════════════════════════════════════

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
  canvases: string[];
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

  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;

  onStateChange: (handler: StateChangeHandler) => Unsubscribe;
  onDataChange: (handler: DataChangeHandler) => Unsubscribe;

  dispose: () => void;
};
