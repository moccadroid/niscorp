import type { Stream, Listener, FinalState, SelectedStreamDeps, StreamError } from './types';
import { createPendingFinal } from './types';
import { splitPath, getByPath, resolvePath } from './path';

export const createSelectedStream = <P>(deps: SelectedStreamDeps): Stream<P> => {
  const segments = splitPath(deps.path);
  const listeners = new Set<Listener<P>>();
  const finalListeners = new Set<Listener<P>>();
  const errorListeners = new Set<(error: StreamError) => void>();
  let finalState: FinalState<P> = createPendingFinal<P>();
  let lastEmitted: { hasValue: false } | { hasValue: true; value: P } = { hasValue: false };
  let isDestroyed = false;

  let isNotifying = false;
  const pendingImmediateFires: Array<() => void> = [];

  const project = (): P => getByPath(deps.getRootValue(), segments) as P;

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

  const unsubChange = deps.onRootChange(() => {
    if (isDestroyed) return;
    const projected = project();

    // Reference equality is enough: a snapshot keeps the reference of every
    // subtree that did not change.
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

  const unsubError = deps.onRootError((err) => {
    if (isDestroyed) return;
    if (!coversPath(err.path, deps.path)) return;
    for (const listener of errorListeners) listener(err);
  });

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
    // A selection made after the root finalized is never told of it: settle
    // here, or this listener is never called.
    if (!finalState.resolved && deps.hasRootFinalized()) resolveFinal(project());
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

  const select = <Q = unknown>(subPath: string): Stream<Q> =>
    deps.resolveSubSelect(resolvePath(deps.path, subPath)) as Stream<Q>;

  const destroy = (): void => {
    if (isDestroyed) return;
    isDestroyed = true;
    unsubChange();
    unsubFinalize();
    unsubError();
    listeners.clear();
    finalListeners.clear();
    errorListeners.clear();
    pendingImmediateFires.length = 0;
    if (!finalState.resolved) {
      // Pre-caught so a selection nobody awaited raises no unhandled rejection;
      // a held promise still rejects.
      finalState.promise.catch(() => {});
      finalState.reject(new Error('[solid] stream destroyed'));
    }
  };

  return { write: () => {}, close: () => {}, destroy, current, final, on, onFinal, onError, select };
};

const coversPath = (errPath: string, selPath: string): boolean => {
  if (selPath === '') return true;
  if (errPath === selPath) return true;
  return errPath.startsWith(selPath + '.');
};

const DEAD_REJECTION = Promise.reject(new Error('[solid] stream destroyed'));
DEAD_REJECTION.catch(() => {});

export const createDeadStream = <P>(): Stream<P> => ({
  write: () => {},
  close: () => {},
  destroy: () => {},
  current: () => undefined as P,
  final: () => DEAD_REJECTION as Promise<P>,
  on: () => () => {},
  onFinal: () => () => {},
  onError: () => () => {},
  select: <Q = unknown>() => createDeadStream<Q>(),
});
