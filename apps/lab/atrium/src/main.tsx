import { createWire, browserEnv } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { atriumSlotWrapper } from './ui/slot-wrapper';
import './ui/css/theme.css';
import './ui/css/ui.css';

// Atrium's entire browser: its kit, handed to moss's terminal. The wire, the
// mount and the render targets are moss's; atrium owns only the components.
//
// Worth saying plainly, because it is the reason a capability can appear in a
// guest's hand: nothing in this file knows what a stay, a property or a
// connector is. It receives trees and renders them. When a version goes live,
// no code here runs that did not already run.
const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

const wire = createWire();
const terminal = mountTerminal({
  targets: {
    react: reactTarget({ root, registry: buildRegistry(), slotWrapper: atriumSlotWrapper }),
    dom: domTarget({ root }),
  },
  swapKey: 'ctrl+shift+y',
  wire,
});

Object.assign(window, { swapTerminal: terminal.swap });

// ─── the other application on this page ──────────────────────
//
// A SECOND wire, to a DIFFERENT server, under a DIFFERENT token: our own
// administration tool, floating over the customer's app in the opposite corner.
// The two share a page and nothing else — separate sockets, separate charters,
// separate processes. Nothing atrium serves mentions it, and atrium's server
// never learns it is here.
//
// The gate is not this branch. A page with a stale key still gets nothing,
// because the admin service resolves an unknown principal to a charter whose
// public role grants no actions — an empty application, not a locked one. This
// only avoids opening a socket nobody asked for.
//
// So Rosa and Amara never see the pill: not because a flag hides it, but
// because nothing they can possess authenticates to a service that is not
// theirs.
// A link is how we get in, because a link is what a person can be handed. The
// admin service prints one; opening it gives this page the token and takes it
// straight back out of the address bar, so what is left in history is an
// ordinary URL and the credential ends up where every other session token in
// this app already lives. `?admin=off` is the way back out.
//
// A bearer credential in a query string is the lab's existing posture (PLAN.md
// says so about the guest links too) and not one to keep when this stops being
// a lab: it survives in shell history and in any proxy log between here and
// there. Real auth replaces the mint and this line together.
const ADMIN_TOKEN_KEY = 'atrium.admin';

const adminToken = ((): string | null => {
  try {
    const url = new URL(window.location.href);
    const offered = url.searchParams.get('admin');
    if (offered !== null) {
      if (offered === 'off') window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      else window.localStorage.setItem(ADMIN_TOKEN_KEY, offered);
      url.searchParams.delete('admin');
      window.history.replaceState({}, '', url.toString());
    }
    return window.localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null; // storage-less context — no pill, no complaint
  }
})();

if (adminToken !== null && adminToken !== '') {
  const adminRoot = document.createElement('div');
  document.body.appendChild(adminRoot);
  mountTerminal({
    targets: { react: reactTarget({ root: adminRoot, registry: buildRegistry(), slotWrapper: atriumSlotWrapper }) },
    wire: createWire({
      url: import.meta.env['VITE_ADMIN_URL'] ?? 'ws://localhost:8790/socket',
      // Its own token key, so signing out of the app does not sign us out of
      // our own tool, and holding our tool says nothing about who we are in
      // theirs.
      env: browserEnv({ tokenKey: ADMIN_TOKEN_KEY }),
    }),
  });
}
