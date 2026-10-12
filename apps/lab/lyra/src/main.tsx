import { browserEnv, createWire, readDocumentSnapshot } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { lyraSlotWrapper } from './ui/slot-wrapper';
import './ui/css/theme.css';
import './ui/css/ui.css';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

try {
  const url = new URL(window.location.href);
  const offered = url.searchParams.get('login');
  if (offered !== null && offered !== '') {
    await fetch('/api/auth/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nonce: offered }),
    });
    // Stripped whether or not it worked: leaving it would re-POST on every reload.
    url.searchParams.delete('login');
    window.history.replaceState({}, '', url.toString());
  }
} catch {
  /* offline — the picker still works */
}

const drawn = readDocumentSnapshot();

const terminal = mountTerminal({
  targets: {
    react: reactTarget({ root, registry: buildRegistry(), slotWrapper: lyraSlotWrapper }),
    dom: domTarget({ root }),
  },
  swapKey: 'ctrl+shift+y',
  resetKey: 'ctrl+shift+u',
  wire: createWire({ env: browserEnv(), ...(drawn !== undefined ? { initial: drawn } : {}) }),
});

Object.assign(window, { swapTerminal: terminal.swap, resetShell: terminal.reset, backTerminal: terminal.back });
