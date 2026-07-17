import type { NovaEvent } from './schemas';

// Wraps a dispatch function so every event passing through it gets stamped
// with `origin` (the dispatching action instance's id) unless it already
// carries one — a re-dispatch keeps its original origin. Adapters wrap the
// dispatch they hand to an instance's rendered subtree with this, so the
// runtime delivers UI events to that instance's own triggers only. This is
// routing semantics: never reimplement it per adapter.
export const scopeDispatch = (
  dispatch: (event: NovaEvent) => void,
  origin: string,
): ((event: NovaEvent) => void) => {
  return (event) => dispatch(event.origin === undefined ? { ...event, origin } : event);
};
