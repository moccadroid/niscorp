import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { buildAdminRegistry } from './ui/registry';

// The tool's browser. Its own page, its own kit, its own socket — the same
// shape as any nisc app's entry point, which is the point: this is an
// application that happens to administer another one, not a widget bolted to
// somebody else's.

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

// SIGNED IN BY BEING HERE, for now. The tool's charter gives an anonymous
// principal no actions at all, so a stranger who finds this port gets an empty
// application rather than a login page to attack. The dev token is minted in
// the page because there is nothing yet to authenticate against — and this is
// the line that changes when there is.
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
