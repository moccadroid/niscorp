import type {
  ActionDefinition,
  ActionFragment,
  ActionInstance,
  EndpointHandler,
  FetchFn,
  FunctionHandler,
  OnErrorHandler,
  PublicActionRuntime,
  TransformFn,
} from '../action';
import type {
  ComponentRegistry,
  LayoutNode,
  LayoutStore,
  RegistrationInput,
  RenderNode,
} from '../layout';
import type { PhraseKeys, Phrasebook } from '../i18n/phrases';
import type { Unsubscribe } from '../shared/common';
import type { EventBus, NovaEvent } from '../shared/event-bus';
import type { MessageBus } from '../shared/message-bus';
import type { IdFactory } from '../shared/ids';

export type CanvasInitialSeed =
  | string
  | { action: string; input?: Record<string, unknown>; with?: string[] };

export type CanvasConfig = {
  id: string;
  mode?: 'stack' | 'list';
  actionLayout?: LayoutNode | string;
  initial?: CanvasInitialSeed | CanvasInitialSeed[];
};

export type PushOptions = {
  origin?: string;
  history?: boolean;
};

export type CanvasState = {
  id: string;
  stack: ActionInstance[];
  active: ActionInstance | undefined;
};

export type RenderApi = {
  frame: () => RenderNode[];
  canvasTree: (canvasId: string) => RenderNode[];
  dispatch: (canvasId: string, event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;
};

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
export type CanvasChangeHandler = (state: CanvasState) => void;

export type ShellTelemetry = {
  onStateChange?: StateChangeHandler;
  onDataChange?: DataChangeHandler;
  onEndpoint?: EndpointHandler;
};

export type ShellConfig = {
  canvases: CanvasConfig[];
  canvasLayout?: LayoutNode | string;
  registry?: ComponentRegistry;
  components?: Record<string, RegistrationInput>;
  layoutStore?: LayoutStore;
  actions: Record<string, ActionDefinition>;
  fragments?: Record<string, ActionFragment>;
  transform?: TransformFn;
  fetch?: FetchFn;
  functions?: Record<string, FunctionHandler>;
  endpointTimeoutMs?: number;
  telemetry?: ShellTelemetry;
  strict?: boolean;
  onError?: OnErrorHandler;
  shellIdFn?: IdFactory;
  instanceIdFn?: IdFactory;
  historyDepth?: number;
  eventBus?: EventBus;
  messageBus?: MessageBus;
  phrases?: Phrasebook;
  phraseKeys?: PhraseKeys;
  onPhraseMiss?: (phrase: string, where: string) => void;
};

export type Shell = {
  readonly id: string;

  readonly registry: ComponentRegistry;
  readonly layoutStore: LayoutStore;

  push: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[], options?: PushOptions) => string;
  originOf: (instanceId: string) => string | undefined;
  pop: (canvasId: string) => void;
  popTo: (canvasId: string, instanceId: string) => void;
  removeInstance: (canvasId: string, instanceId: string) => void;
  replace: (canvasId: string, actionId: string, input?: Record<string, unknown>, fragments?: string[]) => string;
  clear: (canvasId: string) => void;

  back: () => boolean;

  registerAction: (definition: ActionDefinition) => void;

  removeAction: (actionId: string) => void;

  registerFragment: (fragment: ActionFragment) => void;

  addCanvas: (config: CanvasConfig) => void;
  removeCanvas: (canvasId: string) => void;
  setCanvasLayout: (layout: LayoutNode | string) => void;

  setPhrases: (phrases: Phrasebook | undefined) => void;

  getPhrases: () => Phrasebook | undefined;

  setLayout: (refId: string, layout: LayoutNode) => void;

  getCanvasState: (canvasId: string) => CanvasState;
  getRuntime: (instanceId: string) => PublicActionRuntime | undefined;
  getState: () => StateSnapshot;

  getShellRenderTree: () => RenderNode[];

  getCanvasRenderTree: (canvasId: string) => RenderNode[];

  flattenRenderTree: (tree: RenderNode[]) => RenderNode[];

  dispatch: (event: NovaEvent) => void;
  publish: (channel: string, payload?: unknown) => void;

  onStateChange: (handler: StateChangeHandler) => Unsubscribe;
  onDataChange: (handler: DataChangeHandler) => Unsubscribe;

  onEndpoint: (handler: EndpointHandler) => Unsubscribe;

  onCanvasChange: (canvasId: string, handler: CanvasChangeHandler) => Unsubscribe;

  dispose: () => void;
};
