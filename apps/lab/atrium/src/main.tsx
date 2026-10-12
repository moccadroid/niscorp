import { createWire, browserEnv, readDocumentSnapshot } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { atriumSlotWrapper } from './ui/slot-wrapper';
import './ui/css/theme.css';
import './ui/css/ui.css';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

const drawn = readDocumentSnapshot();
const wire = createWire({ env: browserEnv(), ...(drawn !== undefined ? { initial: drawn } : {}) });
const terminal = mountTerminal({
  targets: {
    react: reactTarget({ root, registry: buildRegistry(), slotWrapper: atriumSlotWrapper }),
    dom: domTarget({ root }),
  },
  swapKey: 'ctrl+shift+y',
  resetKey: 'ctrl+shift+u',
  wire,
});

Object.assign(window, { swapTerminal: terminal.swap, resetShell: terminal.reset });

// The `adminToken` check below is not the gate: the admin service resolves an
// unknown principal to a public role that grants no actions. The token arrives
// in a query string, which survives in shell history and proxy logs: a lab's
// posture only.
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
    return null;
  }
})();

if (adminToken !== null && adminToken !== '') {
  const adminRoot = document.createElement('div');
  document.body.appendChild(adminRoot);
  mountTerminal({
    targets: { react: reactTarget({ root: adminRoot, registry: buildRegistry(), slotWrapper: atriumSlotWrapper }) },
    resetKey: 'ctrl+shift+i',
    wire: createWire({
      url: import.meta.env['VITE_ADMIN_URL'] ?? 'ws://localhost:8790/socket',
      env: browserEnv({ tokenKey: ADMIN_TOKEN_KEY }),
    }),
  });
}
