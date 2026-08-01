import { z } from 'zod';
import { createDataStore } from '@shared/data-store';
import type { DataStore } from '@shared/data-store';
import { createIdFactory } from '@shared/ids';
import { DefinitionValidationError } from '@shared/errors';
import type { RenderNode } from '@layout/types';
import type { Mutation, Step } from '../schemas';
import { StepSchema } from '../schemas';
import type {
  ActionInstance,
  ActionRuntime,
  ActionRuntimeConfig,
  ActionStatus,
  DataChangeHandler,
  NavigationEffect,
  OnErrorHandler,
  StatusChangeHandler,
  Unsubscribe,
} from '../types';
import { applyMutations } from '../mutations';
import { buildInitialData, runLifecycleHook } from './lifecycle';
import { collectModelBindings } from './model-bindings';
import { renderRuntime } from './render';
import { executeSteps, noopOnError, type StepContext } from './steps';
import { attachTriggers, type TriggerHandle } from './triggers';

const defaultInstanceIdFactory = createIdFactory('act');

export const createActionRuntime = (config: ActionRuntimeConfig): ActionRuntime => {
  const definition = config.definition;
  const initialData = buildInitialData(definition, config.input);
  // Deep-clone so `reset` can restore nested structures without sharing
  // references with the live data store. Fixes correctness bug where
  // mutating nested objects would corrupt the snapshot used by reset.
  const initialSnapshot: Record<string, unknown> = structuredClone(initialData);
  const dataStore: DataStore = createDataStore(initialData);

  const abortController = new AbortController();
  const strict = config.strict ?? false;
  const onError: OnErrorHandler = config.onError ?? noopOnError;
  const instanceIdFn = config.instanceIdFn ?? defaultInstanceIdFactory;

  const instance: ActionInstance = {
    id: config.instanceId ?? instanceIdFn(),
    definitionId: definition.id,
    canvasId: config.canvasId ?? 'default',
    status: 'initializing',
    data: dataStore.get(),
  };

  const statusSubscribers: StatusChangeHandler[] = [];
  let triggerHandle: TriggerHandle | undefined;
  const modelListeners = new Map<string, { path: string; off: Unsubscribe }>();

  dataStore.subscribe((next) => {
    instance.data = next;
  });

  // The runtime is the only place that knows THIS instance's id, so it desugars
  // `{ removeSelf: true }` — a card's "close me" — into a `removeInstance`
  // carrying the real id before the effect escapes upward. Every other effect
  // passes through untouched.
  const onNavigate =
    config.onNavigate === undefined
      ? undefined
      : (effect: NavigationEffect): void =>
          config.onNavigate!('removeSelf' in effect ? { removeInstance: { instance: instance.id } } : effect);

  const buildContext = (signal: AbortSignal = abortController.signal): StepContext => ({
    dataStore,
    endpoints: definition.endpoints ?? {},
    functions: config.functions ?? {},
    eventBus: config.eventBus,
    messageBus: config.messageBus,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    ...(config.transform === undefined ? {} : { transform: config.transform }),
    ...(onNavigate === undefined ? {} : { onNavigate }),
    // Stamp the call event with this instance's identity before it flows up to
    // the shell's telemetry — `runCall` only knows the endpoint, the runtime
    // knows who made it.
    ...(config.onEndpoint === undefined
      ? {}
      : { onEndpoint: (event) => config.onEndpoint!({ ...event, instanceId: instance.id, canvasId: instance.canvasId }) }),
    extras: {},
    strict,
    onError,
    signal,
    suspended: instance.status === 'suspended',
    // `reload` — re-run this instance's own mount hook. The same refresh
    // `resume` performs, made available as a step for canvases that never
    // suspend (a list keeps every card active, so nothing else would ever
    // re-read one).
    onReload: async () => {
      await runLifecycleHook('mount', definition, buildContext);
    },
  });

  const setStatus = (next: ActionStatus): void => {
    if (instance.status === next) return;
    instance.status = next;
    for (const handler of statusSubscribers.slice()) {
      try {
        handler(next);
      } catch {
        // ignore
      }
    }
  };

  const attach = (): void => {
    if (triggerHandle !== undefined) return;
    const triggers = definition.triggers;
    if (triggers === undefined || triggers.length === 0) return;
    triggerHandle = attachTriggers(triggers, config.eventBus, config.messageBus, buildContext, instance.id);
  };

  const detach = (): void => {
    if (triggerHandle === undefined) return;
    triggerHandle.detach();
    triggerHandle = undefined;
  };

  const getData = (): Record<string, unknown> => dataStore.get();

  const updateData = (updates: Record<string, unknown>): void => {
    dataStore.update((curr) => ({ ...curr, ...updates }));
  };

  const setData = (next: Record<string, unknown>): void => {
    dataStore.update(() => next);
  };

  const applyMutationList = (mutations: Mutation[]): void => {
    if (mutations.length === 0) return;
    dataStore.update((curr) =>
      applyMutations(curr, mutations, { initial: initialSnapshot, strict }),
    );
  };

  const StepArraySchema = z.array(StepSchema);

  const runSteps = async (steps: Step[]): Promise<void> => {
    const parsed = StepArraySchema.safeParse(steps);
    if (!parsed.success) {
      const error = new DefinitionValidationError(
        'Invalid steps passed to runtime.executeSteps',
        { failures: [{ id: definition.id, issues: parsed.error.issues }] },
      );
      if (strict) throw error;
      onError(error);
      return;
    }
    await executeSteps(parsed.data, buildContext());
  };

  const mount = async (input?: Record<string, unknown>): Promise<void> => {
    if (input !== undefined) {
      const next = buildInitialData(definition, input);
      dataStore.update(() => next);
    }
    attach();
    await runLifecycleHook('mount', definition, buildContext);
    setStatus('active');
  };

  const unmount = async (): Promise<void> => {
    // Cancel any in-flight step execution before running unmount hooks.
    abortController.abort();
    detach();
    teardownModelListeners();
    // Unmount hooks run on a fresh (non-aborted) signal so they can
    // perform their own async work (e.g. final telemetry calls).
    const unmountController = new AbortController();
    await runLifecycleHook('unmount', definition, () =>
      buildContext(unmountController.signal),
    );
    setStatus('unmounted');
  };

  const suspend = async (): Promise<void> => {
    await runLifecycleHook('suspend', definition, buildContext);
    setStatus('suspended');
  };

  const resume = async (): Promise<void> => {
    // Becoming active again re-runs `mount` to refresh the action's data — so a
    // backgrounded action (which ignored everything while suspended) is current
    // when it's revealed, with no need to keep it live underneath — then the
    // `resume` hook, if the action defines one.
    setStatus('active');
    await runLifecycleHook('mount', definition, buildContext);
    await runLifecycleHook('resume', definition, buildContext);
  };

  const installModelListener = (ref: string, path: string): void => {
    const off = config.eventBus.on('ui:model', (event) => {
      if (instance.status === 'suspended') return;
      if (event.type !== 'ui:model') return;
      // Same origin scoping as triggers: a stamped model event is delivered to
      // its own instance only; an unstamped (global) one reaches everyone.
      if (event.origin !== undefined && event.origin !== instance.id) return;
      if (event.ref !== ref) return;
      dataStore.update((curr) =>
        applyMutations(curr, [{ set: path, value: event.payload }], {
          initial: initialSnapshot,
          strict,
        }),
      );
    });
    modelListeners.set(ref, { path, off });
  };

  const reconcileModelBindings = (nodes: RenderNode[]): void => {
    const bindings = collectModelBindings(nodes);
    const next = new Map<string, string>();
    for (const b of bindings) next.set(b.ref, b.path);
    // Remove listeners that are no longer referenced OR whose path changed.
    for (const [ref, entry] of modelListeners) {
      const incoming = next.get(ref);
      if (incoming === undefined || incoming !== entry.path) {
        entry.off();
        modelListeners.delete(ref);
      }
    }
    // Install listeners for new bindings.
    for (const [ref, path] of next) {
      if (modelListeners.has(ref)) continue;
      installModelListener(ref, path);
    }
  };

  const teardownModelListeners = (): void => {
    for (const entry of modelListeners.values()) entry.off();
    modelListeners.clear();
  };

  const render = (): RenderNode[] => {
    const out = renderRuntime(definition, dataStore, {
      store: config.layoutStore,
      registry: config.registry,
      strict,
      onError,
    });
    reconcileModelBindings(out);
    return out;
  };

  const onDataChange = (handler: DataChangeHandler): Unsubscribe => dataStore.subscribe(handler);

  const onStatusChange = (handler: StatusChangeHandler): Unsubscribe => {
    statusSubscribers.push(handler);
    return (): void => {
      const idx = statusSubscribers.indexOf(handler);
      if (idx >= 0) statusSubscribers.splice(idx, 1);
    };
  };

  const dispose = (): void => {
    detach();
    teardownModelListeners();
    statusSubscribers.length = 0;
  };

  return {
    get instance() {
      return instance;
    },
    get definition() {
      return definition;
    },
    get dataStore() {
      return dataStore;
    },
    getData,
    setData,
    updateData,
    applyMutations: applyMutationList,
    executeSteps: runSteps,
    mount,
    unmount,
    suspend,
    resume,
    render,
    onDataChange,
    onStatusChange,
    dispose,
  };
};
