import { createScopeChain, resolve } from '@shared/bindings';
import type { ExtraScopes, ScopeChain } from '@shared/bindings';
import type { DataStore } from '@shared/data-store';
import type { EventBus } from '@shared/event-bus';
import { isObject } from '@shared/common';
import type { MessageBus } from '@shared/message-bus';
import { setPath } from '@shared/bindings/paths';
import { applyMutations } from '../mutations';
import type { EndpointConfig, Mutation, Step } from '../schemas';
import { LifecycleError, UnknownFunctionError, type LifecycleHook, type NovaError } from '@shared/errors';
import type {
  FetchFn,
  FunctionHandler,
  NavigateHandler,
  NavigationEffect,
  OnErrorHandler,
  TransformFn,
} from '../types';
import { callEndpoint } from './endpoints';

export type StepContext = {
  dataStore: DataStore;
  endpoints: Record<string, EndpointConfig>;
  functions: Record<string, FunctionHandler>;
  eventBus: EventBus;
  messageBus: MessageBus;
  fetch?: FetchFn;
  transform?: TransformFn;
  onNavigate?: NavigateHandler;
  extras: ExtraScopes;
  strict: boolean;
  onError: OnErrorHandler;
  signal: AbortSignal;
  // When set, this step execution is running inside a lifecycle hook.
  // In strict mode, hard failures (unknown endpoint, fetch error without
  // a handler) propagate as LifecycleError instead of being swallowed.
  lifecycleHook?: LifecycleHook;
};

export const noopOnError: OnErrorHandler = (_error: NovaError): void => {
  // default no-op; users install their own via config
};

// Only `set` (by-value) and `push` carry a user-supplied `value`
// field that can hold a template like `{{@error.message}}`. The
// other ops take paths, booleans, numbers, or nothing — no template
// surface. Pre-resolving here keeps the mutation subsystem
// scope-unaware: ops receive already-literal values.
const resolveMutationValues = (
  list: Mutation[],
  chain: ScopeChain,
  extras: ExtraScopes,
): Mutation[] => {
  return list.map((m) => {
    if ('set' in m && 'value' in m) {
      return { ...m, value: resolve(m.value, chain, extras) };
    }
    if ('push' in m && typeof m.push === 'string' && 'value' in m) {
      return { ...m, value: resolve(m.value, chain, extras) };
    }
    return m;
  });
};

const isMutationStep = (step: Step): step is Mutation => {
  if ('set' in step) return true;
  if ('toggle' in step) return true;
  if ('increment' in step) return true;
  if ('decrement' in step) return true;
  if ('removeAt' in step) return true;
  if ('clear' in step) return true;
  if ('reset' in step) return true;
  if ('push' in step) return typeof step.push === 'string';
  if ('pop' in step) return typeof step.pop === 'string';
  return false;
};

const writeTarget = (
  dataStore: DataStore,
  target: string | undefined,
  value: unknown,
): void => {
  if (target === undefined) return;
  dataStore.update((curr) => {
    const next = setPath(curr, target, value);
    return isObject(next) ? next : curr;
  });
};

// Shared fallback for "target name not resolvable" cases (unknown endpoint,
// unknown function). Runs `onError` with a synthetic @error, else throws a
// LifecycleError inside a lifecycle hook, else throws the caller-supplied
// strict error, else silently returns.
const raiseUnknown = async (
  message: string,
  onError: Step[] | undefined,
  ctx: StepContext,
  strictError?: NovaError,
): Promise<void> => {
  if (onError) {
    const errorExtras: ExtraScopes = {
      ...ctx.extras,
      '@error': { message, status: 0 },
    };
    await executeSteps(onError, { ...ctx, extras: errorExtras });
    return;
  }
  if (ctx.lifecycleHook !== undefined) {
    throw new LifecycleError(message, { hook: ctx.lifecycleHook });
  }
  if (ctx.strict && strictError !== undefined) throw strictError;
};

const runCall = async (
  callName: string,
  onSuccess: Step[] | undefined,
  onError: Step[] | undefined,
  ctx: StepContext,
): Promise<void> => {
  const endpoint = ctx.endpoints[callName];
  if (endpoint === undefined) {
    await raiseUnknown(`unknown endpoint: ${callName}`, onError, ctx);
    return;
  }
  if ('fn' in endpoint && ctx.functions[endpoint.fn] === undefined) {
    await raiseUnknown(
      `unknown function: ${endpoint.fn}`,
      onError,
      ctx,
      new UnknownFunctionError(endpoint.fn),
    );
    return;
  }
  const result = await callEndpoint({
    endpoint,
    data: ctx.dataStore.get(),
    fetch: ctx.fetch,
    transform: ctx.transform,
    signal: ctx.signal,
    functions: ctx.functions,
  });
  if (ctx.signal.aborted) return;
  if (!result.ok && result.error.aborted === true) return;
  if (result.ok) {
    writeTarget(ctx.dataStore, endpoint.target, result.data);
    if (onSuccess) await executeSteps(onSuccess, ctx);
    return;
  }
  writeTarget(ctx.dataStore, endpoint.errorTarget, result.error);
  if (onError) {
    const errorExtras: ExtraScopes = { ...ctx.extras, '@error': result.error };
    await executeSteps(onError, { ...ctx, extras: errorExtras });
    return;
  }
  if (ctx.lifecycleHook !== undefined) {
    throw new LifecycleError(`endpoint '${callName}' failed: ${result.error.message}`, {
      hook: ctx.lifecycleHook,
    });
  }
};

const navigate = (effect: NavigationEffect, ctx: StepContext): void => {
  if (ctx.onNavigate === undefined) return;
  ctx.onNavigate(effect);
};

export const executeSteps = async (steps: Step[], ctx: StepContext): Promise<void> => {
  let buffer: Mutation[] = [];

  const flush = (): void => {
    if (buffer.length === 0) return;
    const list = buffer;
    buffer = [];
    // Resolve templates against the state at flush entry, matching
    // how `emit` captures data before publishing. The `@error` (and
    // any other) scope lives in ctx.extras.
    const chain = createScopeChain(ctx.dataStore.get());
    const resolved = resolveMutationValues(list, chain, ctx.extras);
    ctx.dataStore.update((curr) => applyMutations(curr, resolved));
  };

  for (const step of steps) {
    if (ctx.signal.aborted) {
      buffer = [];
      return;
    }
    if (isMutationStep(step)) {
      buffer.push(step);
      continue;
    }
    flush();

    if ('call' in step) {
      await runCall(step.call, step.onSuccess, step.onError, ctx);
      if (ctx.signal.aborted) return;
      continue;
    }
    if ('emit' in step) {
      const data = ctx.dataStore.get();
      const chain = createScopeChain(data);
      const resolvedChannel = resolve(step.emit.channel, chain, ctx.extras);
      const channel =
        typeof resolvedChannel === 'string' ? resolvedChannel : String(resolvedChannel ?? '');
      const payload =
        step.emit.payload === undefined
          ? undefined
          : resolve(step.emit.payload, chain, ctx.extras);
      ctx.messageBus.publish(channel, payload);
      continue;
    }
    if ('push' in step) {
      navigate(step, ctx);
      continue;
    }
    if ('pop' in step) {
      navigate(step, ctx);
      continue;
    }
    if ('replace' in step) {
      navigate(step, ctx);
      continue;
    }
  }

  flush();
};
