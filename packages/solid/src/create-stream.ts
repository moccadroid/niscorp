import type { Stream, CreateStreamOptions, Listener, FinalState } from './types';
import { createPendingFinal } from './types';
import { deriveDefaults } from './derive-defaults';
import { createIncrementalParser } from './incremental-parser';
import { createFinalizationTracker } from './finalization-tracker';
import { createSelectedStream, createDeadStream } from './selected-stream';

// ═══════════════════════════════════════════════════════════
// createStream — root stream factory
// ═══════════════════════════════════════════════════════════

export const createStream = <T>(options: CreateStreamOptions<T>): Stream<T> => {
  const base = resolveBase(options);

  // ─── State ───
  let currentValue: T = structuredClone(base);
  let isClosed = false;
  let isDestroyed = false;
  const parser = createIncrementalParser(base);
  const tracker = createFinalizationTracker();

  // ─── Listeners ───
  const listeners = new Set<Listener<T>>();
  const finalListeners = new Set<Listener<T>>();
  const changeSubscribers = new Set<() => void>();
  const finalizeSubscribers = new Set<() => void>();
  let finalState: FinalState<T> = createPendingFinal<T>();
  const selectedStreams = new Map<string, Stream<unknown>>();

  // Re-entrancy protection
  let isNotifying = false;
  const pendingImmediateFires: Array<() => void> = [];

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
    if (isClosed || isDestroyed) return;

    const events = parser.write(chunk);
    tracker.process(events);

    // Structural sharing: only objects along dirty paths get new references.
    // Everything else keeps the same reference from the previous snapshot.
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
    changeSubscribers.clear();
    finalizeSubscribers.clear();
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
      resolveSubSelect: (fullPath) => select(fullPath),
    });

    selectedStreams.set(path, selected as Stream<unknown>);
    return selected;
  };

  return { write, close, destroy, current, final, on, onFinal, select };
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
