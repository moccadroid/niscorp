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
  MutationError,
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

export { paletteFromRegistry, paletteEntryOf } from './agent/palette';
export type { LayoutPaletteEntry, PaletteFromRegistryOptions } from './agent/palette';

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
  FunctionDefinition,
  FetchInit,
  FetchResponse,
  NavigationEffect,
  NavigateHandler,
  DataChangeHandler,
  StatusChangeHandler,
} from './action';

// `getPath` alone: writes go through the runtime's `ui:model` pipeline, so
// `setPath` and `deletePath` stay internal.
export { getPath } from './shared';

export { createShell, shellView, shellSettled, shellIdle, canvasTreeOf, hasVisibleContent, DEFAULT_SETTLE_WAIT_MS, CANVAS_SLOT_NAME, ACTION_SLOT_NAME, reconcileCanvas, DEFAULT_HISTORY_DEPTH, navigatedChannel } from './shell';
export type { ShellView } from './shell';

export { HEAD_NAME, HEAD_TITLE_NAME, HEAD_META_NAME, HEAD_LINK_NAME, HEAD_SCRIPT_NAME, HEAD_NAMES, headKeyOf, HEAD_META, HeadPropsSchema, HeadTitlePropsSchema, HeadMetaPropsSchema, HeadLinkPropsSchema, HeadScriptPropsSchema } from './layout';
export type { HeadElement, HeadMetaProps, HeadLinkProps, HeadScriptProps } from './layout';
export { headOf, isHeadNode } from './shell';
export type { ScreenHead } from './shell';

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
