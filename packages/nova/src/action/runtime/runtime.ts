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
  const initialData = buildInitialData(definition, config.input, config.transform);
  const initialSnapshot: Record<string, unknown> = { ...initialData };
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

  const buildContext = (signal: AbortSignal = abortController.signal): StepContext => ({
    dataStore,
    endpoints: definition.endpoints ?? {},
    eventBus: config.eventBus,
    messageBus: config.messageBus,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    ...(config.transform === undefined ? {} : { transform: config.transform }),
    ...(config.onNavigate === undefined ? {} : { onNavigate: config.onNavigate }),
    extras: {},
    strict,
    onError,
    signal,
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
    triggerHandle = attachTriggers(triggers, config.eventBus, config.messageBus, buildContext);
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
    dataStore.update((curr) => applyMutations(curr, mutations, initialSnapshot));
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
      const next = buildInitialData(definition, input, config.transform);
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
    await runLifecycleHook('resume', definition, buildContext);
    setStatus('active');
  };

  const installModelListener = (ref: string, path: string): void => {
    const off = config.eventBus.on('ui:model', (event) => {
      if (event.type !== 'ui:model') return;
      if (event.ref !== ref) return;
      dataStore.update((curr) => applyMutations(curr, [{ set: path, value: event.payload }]));
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
