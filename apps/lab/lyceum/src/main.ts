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

mountTerminal({
  targets: { dom: lyceumTarget({ root }) },
  // The shell is server state keyed by principal; a wedged one is not
  // something a reload can fix. This asks for a fresh one.
  resetKey: 'ctrl+shift+u',
  wire: createWire(seat === null || seat === '' ? {} : { env: browserEnv({ tokenKey: `nisc.token.${seat}` }) }),
});
