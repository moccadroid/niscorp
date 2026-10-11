// ═══════════════════════════════════════════════════════════════
// The browser's back button, caught.
//
// ⟲ WITHOUT IT, BACK UNLOADS THE APPLICATION. A moss terminal never touches the
// URL, so a tab holds exactly one history entry and back means "leave the
// page" — the socket drops, the shell goes unattended, and somebody who wants
// to close a screen gets a blank tab instead. Nothing is lost (the shell is
// durable, keyed by principal, and a reload reattaches to it) but nobody
// pressing back is thinking about that.
//
// What it does: keep ONE spare history entry ahead of the page and spend it on
// every press. Back consumes the spare, this puts another one
// straight back, and the gesture is handed to the terminal — which sends it up
// the wire, where the shell that owns the navigation decides what back means.
//
// The URL never changes. That is the honest position while location lives on
// the SERVER: the shell is keyed by principal, not by tab, so an address bar
// would be a per-tab claim on state two tabs share. When deep links arrive they
// arrive as a projection of the shell's own location, and this file is where
// the gesture will already be.
// ═══════════════════════════════════════════════════════════════

export type BackTrapDisposer = () => void;

// Marks the entry as ours, so a host that keeps its own history state can tell
// this one apart. Nothing reads it; a debugger looking at `history.state`
// deserves to find a name rather than an empty object.
const SENTINEL = { nisc: 'terminal-back' } as const;

// Catch the host's back gesture and call `handler` instead of letting the page
// unload. A no-op (and a disposer that does nothing) wherever there is no
// history to trap — a TTY, a TUI, a plain process — so the conductor can ask
// for it unconditionally.
export const trapBack = (handler: () => void): BackTrapDisposer => {
  if (typeof window === 'undefined') return () => undefined;
  // A window is not always a browser's: one stood up outside a browser may
  // have no history at all, whatever the type says of it.
  const history: History | undefined = window.history;
  if (history === undefined || typeof history.pushState !== 'function') return () => undefined;

  // The spare. `pushState` with no url keeps the current address, so this adds
  // an entry without changing what the address bar says or asking the server
  // for anything.
  const spare = (): void => {
    try {
      history.pushState(SENTINEL, '');
    } catch {
      // A sandboxed document can refuse this. Back then keeps the browser's
      // default rather than throwing on the way out of a keypress.
    }
  };

  const onPopState = (): void => {
    // One entry was just spent — replace it, then act. In that order: the
    // handler sends a message up the wire and the answer arrives on another
    // tick, and the history has to be whole before the next press, not after.
    spare();
    handler();
  };

  spare();
  window.addEventListener('popstate', onPopState);
  return () => {
    window.removeEventListener('popstate', onPopState);
    // The spare entry stays. It cannot be removed without navigating, and one
    // dead entry is a far smaller surprise than a navigation nobody asked for.
  };
};
