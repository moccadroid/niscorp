// ═══════════════════════════════════════════════════════════
// @niscorp/nova — shared primitives used by layout/action/shell
// ═══════════════════════════════════════════════════════════

// Common types + guards
export type { Unsubscribe } from './common';
export { isObject, isString, isNumber, isBoolean, isArray, isNonNull, hasKey } from './common';

// Errors
export {
  ErrorCodes,
  NovaError,
  RenderError,
  ComponentNotFoundError,
  LayoutRefNotFoundError,
  DefinitionValidationError,
  UnknownActionError,
  UnknownFunctionError,
  ShellDisposedError,
  LifecycleError,
} from './errors';
export type {
  ErrorCode,
  NovaErrorContext,
  ComponentNotFoundContext,
  LayoutRefNotFoundContext,
  UnknownActionContext,
  UnknownFunctionContext,
  DefinitionValidationFailure,
  DefinitionValidationContext,
  LifecycleHook,
  LifecycleErrorContext,
} from './errors';

// IDs
export { createIdFactory } from './ids';
export type { IdFactory } from './ids';

// Paths (re-exported from bindings — paths live under bindings since they
// are only meaningful within the binding/resolution pipeline)
export { getPath, setPath, deletePath } from './bindings';

// Data store
export { createDataStore } from './data-store';
export type { DataStore } from './data-store';

// ═══════════════════════════════════════════════════════════
// Bindings
// ═══════════════════════════════════════════════════════════
export {
  IfDirectiveSchema,
  ResolvableSchema,
  createScopeChain,
  pushScope,
  resolve,
  resolvePath,
} from './bindings';

export type {
  IfDirective,
  Scope,
  ScopeChain,
  ExtraScopes,
} from './bindings';

// ═══════════════════════════════════════════════════════════
// Event bus
// ═══════════════════════════════════════════════════════════
export { NovaEventSchema, createEventBus } from './event-bus';
export type { NovaEvent, EventBus, EventHandler, EventMatcher } from './event-bus';

// ═══════════════════════════════════════════════════════════
// Message bus
// ═══════════════════════════════════════════════════════════
export { MessageEnvelopeSchema, createMessageBus } from './message-bus';
export type { MessageEnvelope, MessageBus, ChannelHandler } from './message-bus';
