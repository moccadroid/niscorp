import type { DataStore } from '../shared/data-store';
import type { EventBus } from '../shared/event-bus';
import type { Unsubscribe } from '../shared/common';
import type { NovaError } from '../shared/errors';
import type { IdFactory } from '../shared/ids';
import type { MessageBus } from '../shared/message-bus';
import type { ComponentRegistry, LayoutStore, RenderNode } from '../layout/types';
import type { ActionDefinition, Mutation, PopEffect, PushEffect, ReplaceEffect, Step } from './schemas';

// ═══════════════════════════════════════════════════════════
// Status / Instance
// ═══════════════════════════════════════════════════════════

export type ActionStatus = 'initializing' | 'active' | 'suspended' | 'unmounted';

export type ActionInstance = {
  id: string;
  definitionId: string;
  canvasId: string;
  status: ActionStatus;
  data: Record<string, unknown>;
};

// ═══════════════════════════════════════════════════════════
// Callbacks / handlers
// ═══════════════════════════════════════════════════════════

export type DataChangeHandler = (data: Record<string, unknown>) => void;
export type StatusChangeHandler = (status: ActionStatus) => void;
export type { Unsubscribe };

// ═══════════════════════════════════════════════════════════
// Transform / Fetch injection
// ═══════════════════════════════════════════════════════════

export type TransformFn = (config: unknown, source: Record<string, unknown>) => unknown;
export type FetchFn = (url: string, init?: FetchInit) => Promise<FetchResponse>;
export type FunctionHandler = (
  data: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>;

export type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

export type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

// ═══════════════════════════════════════════════════════════
// Navigation effects (escape via onNavigate)
// ═══════════════════════════════════════════════════════════

export type NavigationEffect = PushEffect | PopEffect | ReplaceEffect;
export type NavigateHandler = (effect: NavigationEffect) => void;

// ═══════════════════════════════════════════════════════════
// Runtime config + interface
// ═══════════════════════════════════════════════════════════

export type OnErrorHandler = (error: NovaError) => void;

export type ActionRuntimeConfig = {
  definition: ActionDefinition;
  instanceId?: string;
  instanceIdFn?: IdFactory;
  canvasId?: string;
  input?: Record<string, unknown>;
  eventBus: EventBus;
  messageBus: MessageBus;
  layoutStore: LayoutStore;
  registry: ComponentRegistry;
  transform?: TransformFn;
  fetch?: FetchFn;
  functions?: Record<string, FunctionHandler>;
  onNavigate?: NavigateHandler;
  strict?: boolean;
  onError?: OnErrorHandler;
};

// Narrow public surface — what an external consumer (adapter, telemetry,
// inspector) needs from a runtime obtained via `shell.getRuntime`.
// Lifecycle and mutation control belong to the shell.
export type PublicActionRuntime = {
  readonly instance: ActionInstance;
  readonly definition: ActionDefinition;

  getData: () => Record<string, unknown>;
  setData: (next: Record<string, unknown>) => void;
  render: () => RenderNode[];

  onDataChange: (handler: DataChangeHandler) => Unsubscribe;
  onStatusChange: (handler: StatusChangeHandler) => Unsubscribe;
};

// Internal full runtime — held by the shell, used by tests that exercise
// internals directly. Not re-exported from the package root.
export type ActionRuntime = PublicActionRuntime & {
  readonly dataStore: DataStore;

  updateData: (updates: Record<string, unknown>) => void;
  applyMutations: (mutations: Mutation[]) => void;
  executeSteps: (steps: Step[]) => Promise<void>;

  mount: (input?: Record<string, unknown>) => Promise<void>;
  unmount: () => Promise<void>;
  suspend: () => Promise<void>;
  resume: () => Promise<void>;

  dispose: () => void;
};
