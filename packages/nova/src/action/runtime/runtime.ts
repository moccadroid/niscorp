import { z } from 'zod';
import { createDataStore } from '@shared/data-store';
import type { DataStore } from '@shared/data-store';
import { createIdFactory } from '@shared/ids';
import { DefinitionValidationError, ErrorCodes, NovaError } from '@shared/errors';
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
import { executeSteps, noopOnError, type EndpointCalls, type StepContext } from './steps';
import { attachTriggers, type TriggerHandle } from './triggers';
import { ambientCause, isRunaway, nextCause, runawayMessage, type Cause } from './cause';

const defaultInstanceIdFactory = createIdFactory('act');

export const createActionRuntime = (config: ActionRuntimeConfig): ActionRuntime => {
  const definition = config.definition;
  const initialData = buildInitialData(definition, config.input);
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
  let modelWriteOff: Unsubscribe | undefined;
  const modelListeners = new Map<string, string>();

  dataStore.subscribe((next) => {
    instance.data = next;
  });

  const ledger = new Map<string, { issued: number; landed: number; stop?: Unsubscribe }>();
  const entryOf = (endpoint: string): { issued: number; landed: number; stop?: Unsubscribe } => {
    const existing = ledger.get(endpoint);
    if (existing !== undefined) return existing;
    const created = { issued: 0, landed: 0 };
    ledger.set(endpoint, created);
    return created;
  };
  const calls: EndpointCalls = {
    begin: (endpoint) => {
      const entry = entryOf(endpoint);
      entry.issued += 1;
      return entry.issued;
    },
    land: (endpoint, ticket) => {
      const entry = entryOf(endpoint);
      if (ticket < entry.landed) return false;
      entry.landed = ticket;
      entry.stop?.();
      delete entry.stop;
      return true;
    },
    follow: (endpoint, ticket, stop) => {
      const entry = entryOf(endpoint);
      if (ticket !== entry.landed || abortController.signal.aborted) {
        stop();
        return;
      }
      entry.stop?.();
      entry.stop = stop;
    },
  };
  const stopFollowing = (): void => {
    for (const entry of ledger.values()) {
      entry.stop?.();
      delete entry.stop;
    }
  };

  // A reconcile's origin is the definition id, not the instance id: a
  // remounted action still owns what it placed.
  const stamp = (effect: NavigationEffect): NavigationEffect => {
    if ('removeSelf' in effect) return { removeInstance: { instance: instance.id } };
    if ('reconcile' in effect) return { reconcile: { origin: instance.definitionId, ...effect.reconcile } };
    return effect;
  };
  const onNavigate =
    config.onNavigate === undefined ? undefined : (effect: NavigationEffect): void => config.onNavigate!(stamp(effect));

  // A reload asked for while one runs joins it as one more round, with the
  // newest cause: a second mount beside it would double every turn under a
  // trigger that reloads and re-emits.
  let reloading = false;
  let reloadAgain: { cause: Cause | undefined } | undefined;
  const reload = async (cause: Cause | undefined): Promise<void> => {
    if (reloading) {
      reloadAgain = { cause };
      return;
    }
    reloading = true;
    try {
      let next: { cause: Cause | undefined } | undefined = { cause };
      while (next !== undefined) {
        reloadAgain = undefined;
        const hop = nextCause(next.cause);
        if (isRunaway(hop)) {
          onError(new NovaError(ErrorCodes.runaway, runawayMessage(hop, `Reloading "${definition.id}"`), { depth: hop.depth, hops: hop.root.hops }));
          return;
        }
        await runLifecycleHook('mount', definition, () => buildContext(abortController.signal, hop));
        next = reloadAgain;
      }
    } finally {
      reloading = false;
      reloadAgain = undefined;
    }
  };

  const buildContext = (signal: AbortSignal = abortController.signal, cause?: Cause): StepContext => ({
    dataStore,
    endpoints: definition.endpoints ?? {},
    functions: config.functions ?? {},
    ...(config.endpointTimeoutMs === undefined ? {} : { endpointTimeoutMs: config.endpointTimeoutMs }),
    eventBus: config.eventBus,
    messageBus: config.messageBus,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    ...(config.transform === undefined ? {} : { transform: config.transform }),
    ...(onNavigate === undefined ? {} : { onNavigate }),
    ...(config.onEndpoint === undefined
      ? {}
      : { onEndpoint: (event) => config.onEndpoint!({ ...event, instanceId: instance.id, canvasId: instance.canvasId }) }),
    ...(config.onChain === undefined ? {} : { onChain: config.onChain }),
    calls,
    extras: {},
    initial: initialSnapshot,
    strict,
    onError,
    signal,
    suspended: instance.status === 'suspended',
    onReload: reload,
    ...(cause === undefined ? {} : { cause }),
  });

  const setStatus = (next: ActionStatus): void => {
    if (instance.status === next) return;
    instance.status = next;
    for (const handler of statusSubscribers.slice()) {
      try {
        handler(next);
      } catch {}
    }
  };

  const attach = (): void => {
    // Before the trigger subscriptions and before either early return: the bus
    // calls handlers in the order they subscribed, so a trigger on `ui:model`
    // reads the value the event just wrote.
    if (modelWriteOff === undefined) {
      modelWriteOff = config.eventBus.on('ui:model', (event) => {
        if (event.type !== 'ui:model' || instance.status === 'suspended') return;
        if (event.origin !== undefined && event.origin !== instance.id) return;
        if (event.ref === undefined) return;
        const path = modelListeners.get(event.ref);
        if (path === undefined) return;
        dataStore.update((curr) =>
          applyMutations(curr, [{ set: path, value: event.payload }], { initial: initialSnapshot, strict }),
        );
      });
    }
    if (triggerHandle !== undefined) return;
    const triggers = definition.triggers;
    if (triggers === undefined || triggers.length === 0) return;
    triggerHandle = attachTriggers(triggers, config.eventBus, config.messageBus, buildContext, instance.id);
  };

  const detach = (): void => {
    if (modelWriteOff !== undefined) {
      modelWriteOff();
      modelWriteOff = undefined;
    }
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
    // Read before the first await: the navigation that set it is still on the stack.
    const parent = ambientCause();
    const cause = nextCause(parent);
    if (isRunaway(cause)) {
      onError(new NovaError(ErrorCodes.runaway, runawayMessage(cause, `Mounting "${definition.id}"`), { depth: cause.depth, hops: cause.root.hops }));
    } else {
      await runLifecycleHook('mount', definition, () => buildContext(abortController.signal, cause));
    }
    // An instance covered or removed while its mount hook ran stays suspended or unmounted.
    if (instance.status === 'initializing') setStatus('active');
  };

  const unmount = async (): Promise<void> => {
    abortController.abort();
    stopFollowing();
    detach();
    teardownModelListeners();
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
    // `mount` runs again: a suspended action ignored everything, and this
    // re-read is what makes it current when it is revealed.
    setStatus('active');
    await runLifecycleHook('mount', definition, buildContext);
    await runLifecycleHook('resume', definition, buildContext);
  };

  const reconcileModelBindings = (nodes: RenderNode[]): void => {
    modelListeners.clear();
    for (const b of collectModelBindings(nodes)) modelListeners.set(b.ref, b.path);
  };

  const teardownModelListeners = (): void => {
    modelListeners.clear();
  };

  const render = (): RenderNode[] => {
    const language = config.i18n?.();
    const out = renderRuntime(definition, dataStore, {
      store: config.layoutStore,
      registry: config.registry,
      strict,
      onError,
      ...(language?.phrases === undefined ? {} : { phrases: language.phrases }),
      ...(language?.phraseKeys === undefined ? {} : { phraseKeys: language.phraseKeys }),
      ...(language?.onPhraseMiss === undefined ? {} : { onPhraseMiss: language.onPhraseMiss }),
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
    stopFollowing();
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
