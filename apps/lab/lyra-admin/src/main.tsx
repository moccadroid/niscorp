import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { buildAdminRegistry } from './ui/registry';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

// The page mints its own operator token: there is nothing yet to authenticate
// against.
const PRINCIPAL = 'op_lyra';
const token = btoa(JSON.stringify({ sub: PRINCIPAL, iat: Date.now() }))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
try {
  window.localStorage.setItem('nisc.token', token);
} catch {
  /* storage-less context */
}

mountTerminal({
  targets: { react: reactTarget({ root, registry: buildAdminRegistry() }) },
  resetKey: 'ctrl+shift+u',
  wire: createWire(),
});
