export type BackTrapDisposer = () => void;

const BACK_ENTRY_STATE = { nisc: 'terminal-back' } as const;

export const trapBack = (handler: () => void): BackTrapDisposer => {
  if (typeof window === 'undefined') return () => undefined;
  // A window stood up outside a browser may have no history, whatever its type says.
  const history: History | undefined = window.history;
  if (history === undefined || typeof history.pushState !== 'function') return () => undefined;

  const spare = (): void => {
    try {
      history.pushState(BACK_ENTRY_STATE, '');
    } catch {
      // A sandboxed document can refuse: back then keeps the browser's default.
    }
  };

  const onPopState = (): void => {
    // Before the handler: its answer comes on a later tick, and the next press needs the spare.
    spare();
    handler();
  };

  spare();
  window.addEventListener('popstate', onPopState);
  return () => {
    window.removeEventListener('popstate', onPopState);
    // The spare entry stays: it cannot be removed without navigating.
  };
};
