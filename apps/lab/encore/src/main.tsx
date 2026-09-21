import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { buildRegistry } from './ui/registry';
import './ui/css/theme.css';

// Encore's entire browser: a kit, handed to moss's terminal. Nothing in this
// file knows what a festival is — and, more to the point, nothing in it knows
// there is a decision model. The page sends keystrokes and paints trees. That
// the trees rearrange themselves around a sentence is the server's business.
const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

// SIGNED IN BY BEING HERE. The runtime is `dev-open`, so a well-formed token
// naming the operator IS the operator; it is minted in the page because a lab
// demo has nothing to authenticate against. This is the line that changes when
// it does — the `?as=` switch exists so the liaison's narrower room can be
// looked at without editing it.
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
  // The escape hatch: the shell is server state keyed by principal, so a
  // wedged one is not something a reload can fix. This asks for a fresh one.
  resetKey: 'ctrl+shift+u',
  wire: createWire(),
});
