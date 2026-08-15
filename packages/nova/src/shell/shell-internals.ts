import type {
  ActionDefinition,
  ActionFragment,
  ActionRuntime,
  EndpointHandler,
  FunctionHandler,
  LanguageOptions,
  NavigationEffect,
  OnErrorHandler,
} from '../action';
import { ActionDefinitionSchema, ActionFragmentSchema } from '../action';
import { createActionRuntime } from '../action/runtime/runtime';
import type { RuntimeRegistry } from './runtime-registry';
import type { Shell } from './types';
import type { ComponentRegistry, LayoutStore } from '../layout';
import type { EventBus } from '../shared/event-bus';
import type { MessageBus } from '../shared/message-bus';
import {
  DefinitionValidationError,
  type DefinitionValidationFailure,
} from '../shared/errors';
import type { IdFactory } from '../shared/ids';
import type { FetchFn, TransformFn } from '../action';
import type { Canvas } from './canvas';
import type { CanvasState } from './types';

// ═══════════════════════════════════════════════════════════
// Internal helpers for shell.ts — kept here to keep that file's
// public-facing assembly short and scannable.
// ═══════════════════════════════════════════════════════════

export const validateActions = (actions: Record<string, ActionDefinition>): void => {
  const failures: DefinitionValidationFailure[] = [];
  for (const [actionId, def] of Object.entries(actions)) {
    const result = ActionDefinitionSchema.safeParse(def);
    if (!result.success) failures.push({ id: actionId, issues: result.error.issues });
  }
  if (failures.length > 0) {
    throw new DefinitionValidationError(
      `${failures.length} action definition(s) failed validation`,
      { failures },
    );
  }
};

export const validateFragments = (fragments: Record<string, ActionFragment>): void => {
  const failures: DefinitionValidationFailure[] = [];
  for (const [fragmentId, frag] of Object.entries(fragments)) {
    const result = ActionFragmentSchema.safeParse(frag);
    if (!result.success) failures.push({ id: fragmentId, issues: result.error.issues });
  }
  if (failures.length > 0) {
    throw new DefinitionValidationError(
      `${failures.length} action fragment(s) failed validation`,
      { failures },
    );
  }
};

export const snapshotCanvas = (canvas: Canvas): CanvasState => {
  const stack = canvas.stack.slice();
  return {
    id: canvas.id,
    stack,
    active: stack.length === 0 ? undefined : stack[stack.length - 1],
  };
};

export type RuntimeFactoryDeps = {
  eventBus: EventBus;
  messageBus: MessageBus;
  layoutStore: LayoutStore;
  registry: ComponentRegistry;
  transform?: TransformFn;
  fetch?: FetchFn;
  functions?: Record<string, FunctionHandler>;
  strict: boolean;
  onError?: OnErrorHandler;
  instanceIdFn: IdFactory;
  onNavigate: (canvasId: string, effect: NavigationEffect) => void;
  onEndpoint?: EndpointHandler;
  // The shell's language cell, read per render. See ActionRuntimeConfig.i18n.
  i18n?: () => LanguageOptions | undefined;
};

export const createRuntimeFactory = (deps: RuntimeFactoryDeps) => (
  canvasId: string,
  definition: ActionDefinition,
  input: Record<string, unknown> | undefined,
): ActionRuntime =>
  createActionRuntime({
    definition,
    canvasId,
    ...(input === undefined ? {} : { input }),
    eventBus: deps.eventBus,
    messageBus: deps.messageBus,
    layoutStore: deps.layoutStore,
    registry: deps.registry,
    ...(deps.transform === undefined ? {} : { transform: deps.transform }),
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
    ...(deps.functions === undefined ? {} : { functions: deps.functions }),
    onNavigate: (effect) => deps.onNavigate(canvasId, effect),
    ...(deps.onEndpoint === undefined ? {} : { onEndpoint: deps.onEndpoint }),
    strict: deps.strict,
    ...(deps.onError === undefined ? {} : { onError: deps.onError }),
    ...(deps.i18n === undefined ? {} : { i18n: deps.i18n }),
    instanceIdFn: deps.instanceIdFn,
  });

// ═══════════════════════════════════════════════════════════
// Internal escape hatch for tests that need the full ActionRuntime
// (executeSteps, applyMutations, etc.) — NOT re-exported from the
// package root. Tests reach this via `@shell/shell-internals`.
// ═══════════════════════════════════════════════════════════

const shellRegistries = new WeakMap<Shell, RuntimeRegistry>();

export const rememberShellRegistry = (shell: Shell, registry: RuntimeRegistry): void => {
  shellRegistries.set(shell, registry);
};

export const getInternalRuntime = (
  shell: Shell,
  instanceId: string,
): ActionRuntime | undefined => {
  const registry = shellRegistries.get(shell);
  if (registry === undefined) return undefined;
  return registry.get(instanceId);
};
