// ═══════════════════════════════════════════════════════════
// @niscorp/nova — Declarative UI Framework
//
// Public API. Authoring surface only: write an action, register
// it on a shell, push it onto a canvas, it runs. Adapters consume
// RenderNode. Telemetry consumers observe via shell handlers.
//
// Internals (resolvers, mutation appliers, runtime factory, step
// executor, endpoint caller, data store, buses, path helpers, type
// guards) are NOT re-exported. They live under area-specific paths
// for the framework's own use and for tests that exercise internals.
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// Shared — errors + event/message bus types + IDs
// ═══════════════════════════════════════════════════════════
export {
  NovaEventSchema,
  MessageEnvelopeSchema,
  ErrorCodes,
  NovaError,
  RenderError,
  ComponentNotFoundError,
  LayoutRefNotFoundError,
  DefinitionValidationError,
  UnknownActionError,
  ShellDisposedError,
  LifecycleError,
  createIdFactory,
} from './shared';

export type {
  NovaEvent,
  EventBus,
  EventHandler,
  Unsubscribe,
  MessageEnvelope,
  MessageBus,
  ChannelHandler,
  ErrorCode,
  NovaErrorContext,
  ComponentNotFoundContext,
  LayoutRefNotFoundContext,
  DefinitionValidationFailure,
  DefinitionValidationContext,
  UnknownActionContext,
  LifecycleHook,
  LifecycleErrorContext,
  IdFactory,
} from './shared';

// ═══════════════════════════════════════════════════════════
// Layout — authoring schemas, render output, registry/store
// ═══════════════════════════════════════════════════════════
export {
  LayoutNodeSchema,
  LayoutPrimitiveSchema,
  ComponentNodeSchema,
  ConditionalNodeSchema,
  LoopNodeSchema,
  LayoutRefNodeSchema,
  isComponentNode,
  isConditionalNode,
  isLoopNode,
  isLayoutRefNode,
  isLayoutNode,
  isLayoutPrimitive,
  renderLayout,
  renderLayoutFromStore,
  createLayoutStore,
  createComponentRegistry,
} from './layout';

export type {
  LayoutNode,
  LayoutPrimitive,
  ComponentNode,
  ConditionalNode,
  LoopNode,
  LayoutRefNode,
  RenderNode,
  RenderComponentNode,
  RenderTextNode,
  RenderFragmentNode,
  RenderErrorNode,
  ComponentRegistry,
  ComponentEntry,
  ComponentMeta,
  RegistrationInput,
  EventMeta,
  LayoutStore,
} from './layout';

// ═══════════════════════════════════════════════════════════
// Action — authoring schemas + the narrow runtime type returned
// by `shell.getRuntime`. Internal runtime helpers stay internal.
// ═══════════════════════════════════════════════════════════
export {
  MutationSchema,
  StepSchema,
  EffectSchema,
  TriggerConfigSchema,
  EndpointConfigSchema,
  LifecycleConfigSchema,
  ActionDefinitionSchema,
} from './action';

export type {
  Mutation,
  Step,
  Effect,
  CallEffect,
  EmitEffect,
  PushEffect,
  PopEffect,
  ReplaceEffect,
  TriggerConfig,
  EndpointConfig,
  LifecycleConfig,
  ActionDefinition,
  ActionStatus,
  ActionInstance,
  PublicActionRuntime,
  TransformFn,
  FetchFn,
  FetchInit,
  FetchResponse,
  NavigationEffect,
  NavigateHandler,
  DataChangeHandler,
  StatusChangeHandler,
} from './action';

// ═══════════════════════════════════════════════════════════
// Shell — top-level entry point for users
// ═══════════════════════════════════════════════════════════
export { createShell, CANVAS_SLOT_NAME, ACTION_SLOT_NAME } from './shell';

export type {
  CanvasConfig,
  CanvasState,
  Shell,
  ShellConfig,
  ShellTelemetry,
  StateSnapshot,
  ShellStateChangeHandler,
  ShellDataChangeEvent,
  ShellDataChangeHandler,
} from './shell';
