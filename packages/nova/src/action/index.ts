// ═══════════════════════════════════════════════════════════
// @niscorp/nova — Action System
//
// Public surface only. Internal helpers (runtime factory, step
// executor, endpoint caller, mutation appliers, lifecycle utils,
// trigger attacher, render driver) live under './runtime' and
// './mutations' but are NOT re-exported from here. Tests that
// exercise internals import them from area-specific paths.
// ═══════════════════════════════════════════════════════════

// Schemas
export {
  MutationSchema,
  StepSchema,
  EffectSchema,
  TriggerConfigSchema,
  EndpointConfigSchema,
  LifecycleConfigSchema,
  ActionDefinitionSchema,
  ActionFragmentSchema,
} from './schemas';

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
} from './schemas';

// Composition (fragment merge)
export { composeAction } from './compose';

// Types — public + internal runtime types are both exported here so
// the shell (which holds the full runtime) can import them; the
// package root only re-exports the narrow public type.
export type {
  ActionStatus,
  ActionInstance,
  ActionRuntime,
  PublicActionRuntime,
  ActionRuntimeConfig,
  TransformFn,
  FetchFn,
  FetchInit,
  FetchResponse,
  FunctionHandler,
  NavigationEffect,
  NavigateHandler,
  DataChangeHandler,
  StatusChangeHandler,
  OnErrorHandler,
  Unsubscribe,
} from './types';
