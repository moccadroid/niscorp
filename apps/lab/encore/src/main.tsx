import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { buildRegistry } from './ui/registry';
import './ui/css/theme.css';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

// The runtime is `dev-open`, so a well-formed token naming a principal is that principal;
// it is minted in the page because a lab demo has nothing to authenticate against.
const PRINCIPALS: Record<string, string> = { operator: 'op_ada', liaison: 'vl_ilse' };
const principal = PRINCIPALS[new URLSearchParams(window.location.search).get('as') ?? 'operator'] ?? 'op_ada';

const token = btoa(JSON.stringify({ sub: principal, iat: Date.now() }))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');
try {
  window.localStorage.setItem('nisc.token', token);
} catch {
  /* storage-less context */
}

mountTerminal({
  targets: { react: reactTarget({ root, registry: buildRegistry() }) },
  resetKey: 'ctrl+shift+u',
  wire: createWire(),
});
