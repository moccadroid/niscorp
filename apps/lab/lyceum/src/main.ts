import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { domTarget } from '@niscorp/moss/terminal/dom';

// The whole browser. A socket and a renderer — no knowledge of houses, talks
// or anybody's role. Everything a phone, the projector or the speaker's
// controller shows is decided on the server and arrives as trees.
//
// nova's default DOM kit until the kit step (PLAN.md, order of work 4) locks
// lyceum's own look.
const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

mountTerminal({
  targets: { dom: domTarget({ root }) },
  // The shell is server state keyed by principal; a wedged one is not
  // something a reload can fix. This asks for a fresh one.
  resetKey: 'ctrl+shift+u',
  wire: createWire(),
});
