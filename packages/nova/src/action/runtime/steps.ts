import { createScopeChain, resolve } from '@shared/bindings';
import type { ExtraScopes, ScopeChain } from '@shared/bindings';
import type { DataStore } from '@shared/data-store';
import type { EventBus } from '@shared/event-bus';
import { isObject } from '@shared/common';
import type { MessageBus } from '@shared/message-bus';
import { setPath } from '@shared/bindings/paths';
import { applyMutations } from '../mutations';
import { isMutationStep } from '../grammar';
import type { EndpointConfig, Mutation, Step } from '../schemas';
import { LifecycleError, UnknownFunctionError, type LifecycleHook, type NovaError } from '@shared/errors';
import type {
  EndpointEventInit,
  FetchFn,
  FunctionHandler,
  NavigateHandler,
  NavigationEffect,
  OnErrorHandler,
  TransformFn,
} from '../types';
import { callEndpoint } from './endpoints';

// Wall-clock for endpoint durations. `performance` is present in node, the
// browser, and jsdom; `Date.now` is the universal fallback.
const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

export type StepContext = {
  dataStore: DataStore;
  endpoints: Record<string, EndpointConfig>;
  functions: Record<string, FunctionHandler>;
  eventBus: EventBus;
  messageBus: MessageBus;
  fetch?: FetchFn;
  transform?: TransformFn;
  onNavigate?: NavigateHandler;
  // Re-runs this instance's `mount` hook (the `reload` effect). Supplied by
  // the runtime, which owns the definition and its lifecycle.
  onReload?: () => Promise<void>;
  // Reports a completed `call` step upward (the runtime stamps instance/canvas
  // and forwards to telemetry). Aborted calls are not reported.
  onEndpoint?: (event: EndpointEventInit) => void;
  extras: ExtraScopes;
  strict: boolean;
  onError: OnErrorHandler;
  signal: AbortSignal;
  // True when the owning action is suspended (backgrounded under a stack). Event
  // triggers no-op while suspended — only the active action reacts.
  suspended?: boolean;
  // When set, this step execution is running inside a lifecycle hook.
  // In strict mode, hard failures (unknown endpoint, fetch error without
  // a handler) propagate as LifecycleError instead of being swallowed.
  lifecycleHook?: LifecycleHook;
};

export const noopOnError: OnErrorHandler = (_error: NovaError): void => {
  // default no-op; users install their own via config
};

// Template surfaces that get pre-resolved so the mutation subsystem stays
// scope-unaware (ops receive already-literal values): `set`/`push` carry a
// user value (e.g. `{{@error.message}}`); `removeAt`/`move` carry indices
// that can reference the firing event (e.g. `{{@event.payload}}`). A string
// index is resolved and coerced to a number; everything else passes through.
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
    if ('removeAt' in m && typeof m.index === 'string') {
      return { ...m, index: Number(resolve(m.index, chain, extras)) };
    }
    if ('move' in m) {
      return {
        ...m,
        from: typeof m.from === 'string' ? Number(resolve(m.from, chain, extras)) : m.from,
        to: typeof m.to === 'string' ? Number(resolve(m.to, chain, extras)) : m.to,
      };
    }
    return m;
  });
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
  const raw = ctx.endpoints[callName];
  if (raw === undefined) {
    await raiseUnknown(`unknown endpoint: ${callName}`, onError, ctx);
    return;
  }
  // Resolve a function endpoint's `fn` through the data scope before dispatch, so
  // `fn: '{{$.saveFn}}'` lets one action pick its handler from data — the same way
  // push/replace already resolve their `action` target (see resolveNavTarget).
  // Literal fn names (no template) pass through resolve() unchanged.
  let endpoint = raw;
  if ('fn' in raw) {
    const chain = createScopeChain(ctx.dataStore.get());
    const fn = String(resolve(raw.fn, chain, ctx.extras) ?? '');
    endpoint = { ...raw, fn };
    if (ctx.functions[fn] === undefined) {
      await raiseUnknown(`unknown function: ${fn}`, onError, ctx, new UnknownFunctionError(fn));
      return;
    }
  }
  const t0 = now();
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
  // Telemetry: the call completed (ok or error, not aborted) — report it. The
  // endpoint's kind is structural: `fn` in the config means an in-process
  // function endpoint, otherwise an HTTP one.
  ctx.onEndpoint?.({
    name: callName,
    kind: 'fn' in endpoint ? 'fn' : 'http',
    ok: result.ok,
    status: result.ok ? result.status : result.error.status,
    ms: now() - t0,
  });
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

// Resolve a push/replace effect's `input` against the firing scope (current
// data + `@event`), so a trigger can pass dynamic data to the action it opens
// — e.g. `input: { record: '@event.payload' }`. Mirrors how `emit.payload` is
// resolved; without it, input values reach the new action as raw templates.
const resolveInputMap = (
  input: Record<string, unknown>,
  ctx: StepContext,
): Record<string, unknown> => {
  const chain = createScopeChain(ctx.dataStore.get());
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, resolve(value, chain, ctx.extras)]),
  );
};

// Resolve a push/replace target: its `action` (so a trigger can open the action
// a binding names — e.g. `action: '{{@event.payload}}'` to launch the clicked
// result; literal ids pass through unchanged) and its `input` map.
const resolveNavTarget = <T extends { action: string; input?: Record<string, unknown> }>(
  nav: T,
  ctx: StepContext,
): T => {
  const chain = createScopeChain(ctx.dataStore.get());
  const out: T = { ...nav, action: String(resolve(nav.action, chain, ctx.extras) ?? '') };
  if (nav.input !== undefined) out.input = resolveInputMap(nav.input, ctx);
  return out;
};

const resolveNavInput = (effect: NavigationEffect, ctx: StepContext): NavigationEffect => {
  if ('push' in effect) return { push: resolveNavTarget(effect.push, ctx) };
  if ('replace' in effect) return { replace: resolveNavTarget(effect.replace, ctx) };
  if ('resetTo' in effect) return { resetTo: resolveNavTarget(effect.resetTo, ctx) };
  if ('popTo' in effect) {
    const chain = createScopeChain(ctx.dataStore.get());
    return { popTo: { ...effect.popTo, instance: String(resolve(effect.popTo.instance, chain, ctx.extras) ?? '') } };
  }
  if ('removeInstance' in effect) {
    const chain = createScopeChain(ctx.dataStore.get());
    return { removeInstance: { ...effect.removeInstance, instance: String(resolve(effect.removeInstance.instance, chain, ctx.extras) ?? '') } };
  }
  return effect;
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
      navigate(resolveNavInput(step, ctx), ctx);
      continue;
    }
    if ('pop' in step) {
      navigate(step, ctx);
      continue;
    }
    if ('replace' in step) {
      navigate(resolveNavInput(step, ctx), ctx);
      continue;
    }
    if ('popTo' in step) {
      navigate(resolveNavInput(step, ctx), ctx);
      continue;
    }
    if ('resetTo' in step) {
      navigate(resolveNavInput(step, ctx), ctx);
      continue;
    }
    if ('removeInstance' in step) {
      navigate(resolveNavInput(step, ctx), ctx);
      continue;
    }
    if ('removeSelf' in step) {
      // The runtime desugars this to removeInstance with its own id — the step
      // carries no id to resolve.
      navigate(step, ctx);
      continue;
    }
    if ('reload' in step) {
      // Re-read in place. The runtime supplies the handler (it owns the
      // definition and the lifecycle); an action with no mount hook reloads to
      // nothing, which is correct rather than an error.
      await ctx.onReload?.();
      if (ctx.signal.aborted) return;
      continue;
    }
  }

  flush();
};
