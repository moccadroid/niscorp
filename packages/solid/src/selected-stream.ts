import type { Stream, Listener, FinalState, SelectedStreamDeps } from './types';
import { createPendingFinal } from './types';
import { splitPath, getByPath, resolvePath } from './path';

// ═══════════════════════════════════════════════════════════
// Selected stream — lightweight projection over root state
// ═══════════════════════════════════════════════════════════

export const createSelectedStream = <P>(deps: SelectedStreamDeps): Stream<P> => {
  const segments = splitPath(deps.path);
  const listeners = new Set<Listener<P>>();
  const finalListeners = new Set<Listener<P>>();
  let finalState: FinalState<P> = createPendingFinal<P>();
  let lastEmitted: { hasValue: false } | { hasValue: true; value: P } = { hasValue: false };
  let isDestroyed = false;

  // Re-entrancy protection
  let isNotifying = false;
  const pendingImmediateFires: Array<() => void> = [];

  const project = (): P => getByPath(deps.getRootValue(), segments) as P;

  // ─── Notification ───

  const notifyListeners = (value: P): void => {
    isNotifying = true;
    for (const listener of listeners) {
      listener(value);
    }
    isNotifying = false;

    while (pendingImmediateFires.length > 0) {
      const fire = pendingImmediateFires.shift();
      if (fire) fire();
    }
  };

  const resolveFinal = (value: P): void => {
    if (finalState.resolved) return;
    const { resolve } = finalState;
    finalState = { resolved: true, value };
    resolve(value);
    for (const listener of finalListeners) {
      listener(value);
    }
    finalListeners.clear();
  };

  // ─── Root subscriptions ───

  const unsubChange = deps.onRootChange(() => {
    if (isDestroyed) return;
    const projected = project();

    // Reference equality — structural sharing ensures unchanged subtrees
    // keep the same reference, so === is sufficient for change detection.
    if (!lastEmitted.hasValue || lastEmitted.value !== projected) {
      lastEmitted = { hasValue: true, value: projected };
      notifyListeners(projected);
    }

    if (!finalState.resolved && deps.isPathFinal()) {
      resolveFinal(projected);
    }
  });

  const unsubFinalize = deps.onRootFinalize(() => {
    if (isDestroyed) return;
    if (!finalState.resolved) {
      resolveFinal(project());
    }
  });

  // ─── Public interface ───

  const current = (): P => project();

  const final = (): Promise<P> => {
    if (finalState.resolved) return Promise.resolve(finalState.value);
    if (deps.isPathFinal() || deps.isTerminal()) {
      const value = project();
      resolveFinal(value);
      return Promise.resolve(value);
    }
    return finalState.promise;
  };

  const on = (listener: Listener<P>): (() => void) => {
    if (isDestroyed) return () => {};
    listeners.add(listener);

    const projected = project();
    lastEmitted = { hasValue: true, value: projected };

    if (isNotifying) {
      pendingImmediateFires.push(() => listener(projected));
    } else {
      listener(projected);
    }

    return () => { listeners.delete(listener); };
  };

  const onFinal = (listener: Listener<P>): (() => void) => {
    if (isDestroyed) return () => {};
    if (finalState.resolved) {
      listener(finalState.value);
      return () => {};
    }
    finalListeners.add(listener);
    return () => { finalListeners.delete(listener); };
  };

  const select = <Q = unknown>(subPath: string): Stream<Q> =>
    deps.resolveSubSelect(resolvePath(deps.path, subPath)) as Stream<Q>;

  const destroy = (): void => {
    if (isDestroyed) return;
    isDestroyed = true;
    unsubChange();
    unsubFinalize();
    listeners.clear();
    finalListeners.clear();
    pendingImmediateFires.length = 0;
    if (!finalState.resolved) {
      finalState.reject(new Error('[solid] stream destroyed'));
    }
  };

  return { write: () => {}, close: () => {}, destroy, current, final, on, onFinal, select };
};

// ═══════════════════════════════════════════════════════════
// Dead stream — returned after destroy
// ═══════════════════════════════════════════════════════════

const DEAD_REJECTION = Promise.reject(new Error('[solid] stream destroyed'));
DEAD_REJECTION.catch(() => {}); // pre-caught — prevents unhandled rejection

export const createDeadStream = <P>(): Stream<P> => ({
  write: () => {},
  close: () => {},
  destroy: () => {},
  current: () => undefined as P,
  final: () => DEAD_REJECTION as Promise<P>,
  on: () => () => {},
  onFinal: () => () => {},
  select: <Q = unknown>() => createDeadStream<Q>(),
});
