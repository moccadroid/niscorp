import type { DataStore } from '../shared/data-store';
import type { EventBus } from '../shared/event-bus';
import type { Unsubscribe } from '../shared/common';
import type { NovaError } from '../shared/errors';
import type { IdFactory } from '../shared/ids';
import type { MessageBus } from '../shared/message-bus';
import type { ComponentRegistry, LayoutStore, RenderNode } from '../layout/types';
import type { PhraseKeys, Phrasebook } from '../i18n/phrases';
import type { ActionDefinition, Mutation, PopEffect, PopToEffect, PushEffect, RemoveInstanceEffect, RemoveSelfEffect, ReplaceEffect, ResetToEffect, Step } from './schemas';

export type ActionStatus = 'initializing' | 'active' | 'suspended' | 'unmounted';

export type ActionInstance = {
  id: string;
  definitionId: string;
  canvasId: string;
  status: ActionStatus;
  data: Record<string, unknown>;
};

export type DataChangeHandler = (data: Record<string, unknown>) => void;
export type StatusChangeHandler = (status: ActionStatus) => void;
export type { Unsubscribe };

export type TransformFn = (config: unknown, source: unknown) => unknown;
export type FetchFn = (url: string, init?: FetchInit) => Promise<FetchResponse>;
export type FunctionHandler = (
  data: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>;

// A function an app hands over: `execute` is what an `fn:` endpoint calls, and
// `description` says what it does and what to send, for whoever writes a call to it.
export type FunctionDefinition = { id: string; description: string; execute: FunctionHandler };

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
  onChange?: (handler: (body: unknown) => void) => Unsubscribe;
};

export type ReconcileNavigation = {
  reconcile: {
    canvas?: string;
    own?: 'pushed' | 'canvas';
    with?: string[];
    origin?: string;
    desired: { actionId: string; input?: Record<string, unknown>; row?: Record<string, unknown> }[];
  };
};

export type NavigationEffect = PushEffect | PopEffect | ReplaceEffect | PopToEffect | ResetToEffect | RemoveInstanceEffect | RemoveSelfEffect | ReconcileNavigation;
export type NavigateHandler = (effect: NavigationEffect) => void;

export type EndpointEvent = {
  name: string;
  kind: 'fn' | 'http';
  ok: boolean;
  status: number;
  ms: number;
  instanceId: string;
  canvasId: string;
};
export type EndpointEventInit = Omit<EndpointEvent, 'instanceId' | 'canvasId'>;
export type EndpointHandler = (event: EndpointEvent) => void;

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
  endpointTimeoutMs?: number;
  onNavigate?: NavigateHandler;
  onEndpoint?: EndpointHandler;
  onChain?: (chain: Promise<unknown>) => void;
  strict?: boolean;
  onError?: OnErrorHandler;
  i18n?: () => LanguageOptions | undefined;
};

export type LanguageOptions = {
  phrases?: Phrasebook;
  phraseKeys?: PhraseKeys;
  onPhraseMiss?: (phrase: string, where: string) => void;
};

export type PublicActionRuntime = {
  readonly instance: ActionInstance;
  readonly definition: ActionDefinition;

  getData: () => Record<string, unknown>;
  setData: (next: Record<string, unknown>) => void;
  render: () => RenderNode[];

  onDataChange: (handler: DataChangeHandler) => Unsubscribe;
  onStatusChange: (handler: StatusChangeHandler) => Unsubscribe;
};

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
