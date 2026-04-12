import type { Stream, CreateStreamOptions, Listener, FinalState, StreamError } from './types';
import { createPendingFinal } from './types';
import { deriveDefaults } from './derive-defaults';
import { createIncrementalParser } from './incremental-parser';
import { createFinalizationTracker } from './finalization-tracker';
import { createSelectedStream, createDeadStream } from './selected-stream';
import { createValidator } from './validator';

// ═══════════════════════════════════════════════════════════
// createStream — root stream factory
// ═══════════════════════════════════════════════════════════

export const createStream = <T>(options: CreateStreamOptions<T>): Stream<T> => {
  const base = resolveBase(options);
  const mode = options.mode ?? 'recover';
  const constraints = options.constraints ?? 'kind';

  // ─── State ───
  let currentValue: T = structuredClone(base);
  let isClosed = false;
  let isDestroyed = false;
  let isFailed = false;
  let failureError: Error | null = null;

  // ─── Listeners ───
  const listeners = new Set<Listener<T>>();
  const finalListeners = new Set<Listener<T>>();
  const errorListeners = new Set<(error: StreamError) => void>();
  const changeSubscribers = new Set<() => void>();
  const finalizeSubscribers = new Set<() => void>();
  const errorSubscribers = new Set<(error: StreamError) => void>();
  let finalState: FinalState<T> = createPendingFinal<T>();
  const selectedStreams = new Map<string, Stream<unknown>>();

  // Re-entrancy protection
  let isNotifying = false;
  const pendingImmediateFires: Array<() => void> = [];

  // ─── Validator + parser + tracker ───

  const emitError = (err: StreamError): void => {
    for (const listener of errorListeners) listener(err);
    for (const sub of errorSubscribers) sub(err);
  };

  const enterFailedState = (): void => {
    if (isFailed) return;
    isFailed = true;
    isClosed = true;
    failureError = new Error('[solid] stream failed validation');
  };

  const tracker = createFinalizationTracker();

  const validator = createValidator({
    schema: options.schema,
    mode,
    constraints,
    emitError,
    onFailed: enterFailedState,
    getContainerKeys: (path) => tracker.getContainerKeys(path),
  });

  const parser = createIncrementalParser(base, {
    valueOpenHook: validator.valueOpen,
  });

  // ─── Notification ───

  const notify = (value: T): void => {
    isNotifying = true;
    for (const listener of listeners) {
      listener(value);
    }
    for (const sub of changeSubscribers) {
      sub();
    }
    isNotifying = false;

    while (pendingImmediateFires.length > 0) {
      const fire = pendingImmediateFires.shift();
      if (fire) fire();
    }
  };

  const notifyFinal = (value: T): void => {
    if (finalState.resolved) return;
    const { resolve } = finalState;
    finalState = { resolved: true, value };
    resolve(value);
    for (const listener of finalListeners) {
      listener(value);
    }
    finalListeners.clear();
    for (const sub of finalizeSubscribers) {
      sub();
    }
  };

  // ─── Write pipeline ───

  const write = (chunk: string): void => {
    if (isClosed || isDestroyed || isFailed) return;

    const events = parser.write(chunk);

    // The valueOpenHook may have tripped strict mode during parse.
    if (isFailed) return;

    tracker.process(events);

    // Structural sharing: only objects along dirty paths get new references.
    const snap = parser.snapshot(currentValue);
    if (snap.changed) {
      currentValue = snap.value;
      notify(currentValue);
    }

    // Events may finalize paths even when the value didn't change
    // (e.g. closing `}` doesn't change values but completes containers).
    if (!snap.changed && events.length > 0) {
      for (const sub of changeSubscribers) {
        sub();
      }
    }

    // Validator owns finalize orchestration (key tracking + safeParse).
    if (events.length > 0) {
      validator.processEvents(events, () => currentValue);
      if (isFailed) return;
    }

    if (tracker.isRootFinal()) {
      notifyFinal(currentValue);
    }
  };

  const close = (): void => {
    if (isDestroyed || isClosed) return;
    isClosed = true;

    if (!finalState.resolved) {
      notifyFinal(currentValue);
    }
  };

  const destroy = (): void => {
    if (isDestroyed) return;
    isDestroyed = true;

    listeners.clear();
    finalListeners.clear();
    errorListeners.clear();
    changeSubscribers.clear();
    finalizeSubscribers.clear();
    errorSubscribers.clear();
    pendingImmediateFires.length = 0;

    if (!finalState.resolved) {
      finalState.reject(new Error('[solid] stream destroyed'));
    }

    for (const [, selected] of selectedStreams) {
      selected.destroy();
    }
    selectedStreams.clear();
  };

  // ─── Read interface ───

  const current = (): T => currentValue;

  const final = (): Promise<T> => {
    if (isFailed && failureError) return Promise.reject(failureError);
    if (finalState.resolved) return Promise.resolve(finalState.value);
    return finalState.promise;
  };

  const on = (listener: Listener<T>): (() => void) => {
    if (isDestroyed) return () => {};
    listeners.add(listener);

    if (isNotifying) {
      pendingImmediateFires.push(() => listener(currentValue));
    } else {
      listener(currentValue);
    }

    return () => { listeners.delete(listener); };
  };

  const onFinal = (listener: Listener<T>): (() => void) => {
    if (isDestroyed) return () => {};
    if (finalState.resolved) {
      listener(finalState.value);
      return () => {};
    }
    finalListeners.add(listener);
    return () => { finalListeners.delete(listener); };
  };

  const onError = (listener: (error: StreamError) => void): (() => void) => {
    if (isDestroyed) return () => {};
    errorListeners.add(listener);
    return () => { errorListeners.delete(listener); };
  };

  // ─── Selection ───

  const select = <P = unknown>(path: string): Stream<P> => {
    if (isDestroyed) return createDeadStream<P>();

    const cached = selectedStreams.get(path);
    if (cached) return cached as Stream<P>;

    const selected = createSelectedStream<P>({
      path,
      getRootValue: () => currentValue,
      isTerminal: () => isClosed || isDestroyed,
      isPathFinal: () => tracker.isFinal(path),
      onRootChange: (listener) => {
        changeSubscribers.add(listener);
        return () => { changeSubscribers.delete(listener); };
      },
      onRootFinalize: (listener) => {
        finalizeSubscribers.add(listener);
        return () => { finalizeSubscribers.delete(listener); };
      },
      onRootError: (listener) => {
        errorSubscribers.add(listener);
        return () => { errorSubscribers.delete(listener); };
      },
      resolveSubSelect: (fullPath) => select(fullPath),
    });

    selectedStreams.set(path, selected as Stream<unknown>);
    return selected;
  };

  return { write, close, destroy, current, final, on, onFinal, onError, select };
};

// ───────────────────────────────────────────────────────────
// Base resolution
// ───────────────────────────────────────────────────────────

const resolveBase = <T>(options: CreateStreamOptions<T>): T => {
  const { schema, initial } = options;

  if (initial !== undefined) {
    const result = schema.safeParse(initial);
    if (!result.success) {
      throw new Error(`[solid] initial value is invalid: ${result.error.message}`);
    }
    return result.data;
  }

  const candidate = deriveDefaults(schema);
  const result = schema.safeParse(candidate);
  if (!result.success) {
    throw new Error(
      `[solid] cannot derive valid base from schema defaults. Provide an explicit initial value. Error: ${result.error.message}`,
    );
  }
  return result.data;
};
