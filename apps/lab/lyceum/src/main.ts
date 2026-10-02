import { browserEnv, createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { lyceumTarget } from '@lyceum/ui/target';

// The whole browser. A socket and a renderer — no knowledge of houses, talks
// or anybody's role. Everything a phone, the projector or the speaker's
// controller shows is decided on the server and arrives as trees.
//
// The look is lyceum's own kit (src/ui/) — the only renderer code in the app.
const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

// A SEAT is one person's place in this browser. The session token lives in
// localStorage, which every tab of one origin shares — so without a seat, every
// tab is the same person. `?seat=<name>` gives a tab a token of its own that
// survives reloads: `/?seat=ada` and `/?seat=ben` are two people in the room,
// `/dev/as/stage` lands on `/?seat=stage`. A phone opens `/` and has the one.
const seat = new URLSearchParams(window.location.search).get('seat');

// ← and → MOVE THE DECK — and Page Up / Page Down, which is what a presenter's
// clicker sends. On the controller, everywhere: the key presses the
// controller's own Back or Next (the screen's `back` / `next` refs, which only
// the controller has), so it does exactly what a tap does, as the speaker. Not
// in a typing field, so the assistant still gets its arrows.
//
// DEV ONLY, for rehearsing: the same keys on the projector, through a route the
// dev server alone has (vite.config.ts, /dev/deck/*) — the stage's own
// principal cannot move the deck, and stays that way.
const WAYS: Record<string, 'next' | 'back'> = { ArrowRight: 'next', PageDown: 'next', ArrowLeft: 'back', PageUp: 'back' };
window.addEventListener('keydown', (event) => {
  const way = WAYS[event.key];
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (way === undefined || typing || event.metaKey || event.ctrlKey || event.altKey) return;
  const button = document.querySelector(`[data-ref="${way}"]`);
  if (button instanceof HTMLElement) {
    event.preventDefault();
    button.click();
  } else if (import.meta.env.DEV && seat === 'stage') {
    event.preventDefault();
    void fetch(`/dev/deck/${way}`, { method: 'POST' });
  }
});

mountTerminal({
  targets: { dom: lyceumTarget({ root }) },
  // The shell is server state keyed by principal; a wedged one is not
  // something a reload can fix. This asks for a fresh one.
  resetKey: 'ctrl+shift+u',
  wire: createWire(seat === null || seat === '' ? {} : { env: browserEnv({ tokenKey: `nisc.token.${seat}` }) }),
});
