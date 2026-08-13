import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { lyraSlotWrapper } from './ui/slot-wrapper';
import './ui/css/theme.css';
import './ui/css/ui.css';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

// ── ARRIVING ON A SIGN-IN LINK ───────────────────────────────
//
// ⟲ THIS USED TO READ `?token=` AND STORE IT. The link in somebody's inbox was
// the session itself — no expiry, no limit on uses, and worth an account to
// anybody who saw the URL in a mail, a log, a referrer or over a shoulder.
//
// `?login=` is a nonce and nothing else. It buys a session from the server, or
// it does not, and either way it leaves the address bar before anything mounts:
// a link that survives in history is one that gets shared by accident.
try {
  const url = new URL(window.location.href);
  const offered = url.searchParams.get('login');
  if (offered !== null && offered !== '') {
    const answer = await fetch('/api/auth/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonce: offered }),
    });
    if (answer.ok) {
      const { token } = (await answer.json()) as { token?: string };
      if (typeof token === 'string') window.localStorage.setItem('nisc.token', token);
    }
    // Stripped whether or not it worked: a spent nonce is worth nothing, and a
    // refused one is worth less. Leaving it would re-POST on every reload.
    url.searchParams.delete('login');
    window.history.replaceState({}, '', url.toString());
  }
} catch {
  /* storage-less or offline — the picker still works */
}

const terminal = mountTerminal({
  targets: {
    react: reactTarget({ root, registry: buildRegistry(), slotWrapper: lyraSlotWrapper }),
    dom: domTarget({ root }),
  },
  swapKey: 'ctrl+shift+y',
  resetKey: 'ctrl+shift+u',
  wire: createWire(),
});

Object.assign(window, { swapTerminal: terminal.swap, resetShell: terminal.reset });
