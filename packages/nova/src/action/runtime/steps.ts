import { createScopeChain, resolve } from '@shared/bindings';
import type { ExtraScopes, ScopeChain } from '@shared/bindings';
import type { DataStore } from '@shared/data-store';
import type { EventBus } from '@shared/event-bus';
import { isObject } from '@shared/common';
import type { MessageBus } from '@shared/message-bus';
import { setPath } from '@shared/bindings/paths';
import { applyMutations } from '../mutations';
import { isMutationStep } from '../grammar';
import type { EndpointConfig, Mutation, ReconcileEffect, Step } from '../schemas';
import { LifecycleError, UnknownFunctionError, type LifecycleHook, type NovaError } from '@shared/errors';
import type {
  EndpointEventInit,
  FetchFn,
  FunctionHandler,
  NavigateHandler,
  NavigationEffect,
  OnErrorHandler,
  TransformFn,
  Unsubscribe,
} from '../types';
import { callEndpoint } from './endpoints';
import { withCause, type Cause } from './cause';
import { nextTask } from './next-task';

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

export type EndpointCalls = {
  begin: (endpoint: string) => number;
  land: (endpoint: string, ticket: number) => boolean;
  follow: (endpoint: string, ticket: number, stop: Unsubscribe) => void;
};

export type StepContext = {
  dataStore: DataStore;
  endpoints: Record<string, EndpointConfig>;
  functions: Record<string, FunctionHandler>;
  endpointTimeoutMs?: number;
  eventBus: EventBus;
  messageBus: MessageBus;
  fetch?: FetchFn;
  transform?: TransformFn;
  onNavigate?: NavigateHandler;
  onReload?: (cause: Cause | undefined) => Promise<void>;
  cause?: Cause;
  onEndpoint?: (event: EndpointEventInit) => void;
  onChain?: (chain: Promise<unknown>) => void;
  calls?: EndpointCalls;
  extras: ExtraScopes;
  initial?: Record<string, unknown>;
  strict: boolean;
  onError: OnErrorHandler;
  signal: AbortSignal;
  suspended?: boolean;
  lifecycleHook?: LifecycleHook;
};

export const noopOnError: OnErrorHandler = (_error: NovaError): void => {};

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
  const ticket = ctx.calls?.begin(callName);
  const t0 = now();
  const result = await callEndpoint({
    endpoint,
    data: ctx.dataStore.get(),
    fetch: ctx.fetch,
    transform: ctx.transform,
    signal: ctx.signal,
    functions: ctx.functions,
    ...(ctx.endpointTimeoutMs === undefined ? {} : { timeoutMs: ctx.endpointTimeoutMs }),
  });
  if (ctx.signal.aborted) return;
  if (!result.ok && result.error.aborted === true) return;
  ctx.onEndpoint?.({
    name: callName,
    kind: 'fn' in endpoint ? 'fn' : 'http',
    ok: result.ok,
    status: result.ok ? result.status : result.error.status,
    ms: now() - t0,
  });
  if (result.ok) {
    const isCurrent = ticket === undefined || ctx.calls === undefined || ctx.calls.land(callName, ticket);
    if (isCurrent) {
      writeTarget(ctx.dataStore, endpoint.target, result.data);
      const { dataStore } = ctx;
      const { target } = endpoint;
      if (result.onChange !== undefined && ticket !== undefined && ctx.calls !== undefined) {
        ctx.calls.follow(callName, ticket, result.onChange((data) => writeTarget(dataStore, target, data)));
      }
    }
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
  const { onNavigate } = ctx;
  if (onNavigate === undefined) return;
  withCause(ctx.cause, () => onNavigate(effect));
};

const resolveInputMap = (
  input: Record<string, unknown>,
  ctx: StepContext,
): Record<string, unknown> => {
  const chain = createScopeChain(ctx.dataStore.get());
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, resolve(value, chain, ctx.extras)]),
  );
};

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

const resolveReconcile = (step: ReconcileEffect, ctx: StepContext): NavigationEffect => {
  const { to, action, input, ...rest } = step.reconcile;
  const rows = resolve(to, createScopeChain(ctx.dataStore.get()), ctx.extras);
  const desired = (Array.isArray(rows) ? rows : []).flatMap((row: unknown) => {
    if (!isObject(row)) return [];
    const actionId = row[action];
    if (typeof actionId !== 'string' || actionId === '') return [];
    const seeded = input === undefined ? undefined : row[input];
    return [isObject(seeded) ? { actionId, input: seeded } : { actionId }];
  });
  return { reconcile: { ...rest, desired } };
};

export const executeSteps = async (steps: Step[], ctx: StepContext): Promise<void> => {
  let buffer: Mutation[] = [];

  const flush = (): void => {
    if (buffer.length === 0) return;
    const list = buffer;
    buffer = [];
    // Every template in a run of mutations resolves against the data as it
    // stood before the run.
    const chain = createScopeChain(ctx.dataStore.get());
    const resolved = resolveMutationValues(list, chain, ctx.extras);
    ctx.dataStore.update((curr) =>
      applyMutations(curr, resolved, { ...(ctx.initial === undefined ? {} : { initial: ctx.initial }), strict: ctx.strict }),
    );
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
      // Published on the next task, not in this turn: when steps emit and then
      // pop, the listener is the action underneath, suspended until the pop.
      // A task and not a microtask: a listener that emits again would chain
      // microtasks, and the event loop would never turn.
      const { messageBus, cause } = ctx;
      const delivered = new Promise<void>((resolve) => {
        nextTask(() => {
          try {
            messageBus.publish(channel, payload, cause);
          } finally {
            resolve();
          }
        });
      });
      ctx.onChain?.(delivered);
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
    if ('reconcile' in step) {
      navigate(resolveReconcile(step, ctx), ctx);
      continue;
    }
    if ('removeSelf' in step) {
      navigate(step, ctx);
      continue;
    }
    if ('reload' in step) {
      await ctx.onReload?.(ctx.cause);
      if (ctx.signal.aborted) return;
      continue;
    }
  }

  flush();
};
