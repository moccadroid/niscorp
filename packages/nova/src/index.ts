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
  UnknownFragmentError,
  UnknownFunctionError,
  ShellDisposedError,
  LifecycleError,
  createIdFactory,
  scopeDispatch,
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
  UnknownFragmentContext,
  UnknownFunctionContext,
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
  SlotNodeSchema,
  isComponentNode,
  isConditionalNode,
  isLoopNode,
  isLayoutRefNode,
  isSlotNode,
  isLayoutNode,
  isLayoutPrimitive,
  renderLayout,
  renderLayoutFromStore,
  render,
  fillSlots,
  createLayoutStore,
  createComponentRegistry,
  renderNodeKey,
  NOVA_MODEL_PROP,
  NOVA_REF_PROP,
} from './layout';

export type {
  LayoutNode,
  LayoutPrimitive,
  ComponentNode,
  ConditionalNode,
  LoopNode,
  LayoutRefNode,
  SlotNode,
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
  RenderOptions,
  RenderOnError,
  ModelBindingDescriptor,
} from './layout';

// The layout-agent palette, and the per-entry converter under it. Exported
// because moss's integration contract builds the same author-facing view of a
// component (name, description, props schema) from the same source — one
// converter, so the palette and the contract cannot drift.
export { paletteFromRegistry, paletteEntryOf } from './agent/palette';
export type { LayoutPaletteEntry, PaletteFromRegistryOptions } from './agent/palette';

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
  ActionFragmentSchema,
  composeAction,
  auditAction,
  collectChannels,
} from './action';
export type { AuditCatalogEntry, AuditOptions, AuditResult, ChannelUsage } from './action';

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
  ActionFragment,
  ActionStatus,
  ActionInstance,
  PublicActionRuntime,
  TransformFn,
  FetchFn,
  FunctionHandler,
  FetchInit,
  FetchResponse,
  NavigationEffect,
  NavigateHandler,
  DataChangeHandler,
  StatusChangeHandler,
} from './action';

// ═══════════════════════════════════════════════════════════
// Bindings — read a value out of a data tree by dot path. The one
// path helper exposed: editors and custom widgets read sibling
// document state by path (set/delete stay internal — writes go
// through the runtime's `ui:model` pipeline, not direct mutation).
// ═══════════════════════════════════════════════════════════
export { getPath } from './shared';

// ═══════════════════════════════════════════════════════════
// Shell — top-level entry point for users
// ═══════════════════════════════════════════════════════════
export { createShell, CANVAS_SLOT_NAME, ACTION_SLOT_NAME, reconcileCanvas, DEFAULT_HISTORY_DEPTH, navigatedChannel } from './shell';

export type {
  CanvasConfig,
  CanvasInitialSeed,
  CanvasState,
  RenderApi,
  Shell,
  ShellConfig,
  ShellTelemetry,
  StateSnapshot,
  ShellStateChangeHandler,
  ShellDataChangeEvent,
  ShellDataChangeHandler,
  ShellCanvasChangeHandler,
  PushOptions,
  HistoryEntry,
  HistoryFrame,
  NavigatedMessage,
  Desired,
  ReconcileOptions,
  ReconcileResult,
} from './shell';
