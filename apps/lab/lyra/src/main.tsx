import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { lyraSlotWrapper } from './ui/slot-wrapper';
import './ui/css/theme.css';
import './ui/css/ui.css';

// Lyra's entire browser: its kit, handed to moss's terminal. The wire, the
// mount and the render targets are moss's; lyra owns only the components.
//
// Worth saying plainly, because it is the reason a studio can look like a
// different product: nothing in this file knows what a member, a class or a
// theme is. It receives trees and renders them. When a studio's layouts change,
// no code here runs that did not already run.
const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

// A sign-in link carries its token in the query string. Take it, store it the
// way the wire expects, and put the address bar back — so what survives in
// history is an ordinary URL rather than a live credential.
//
// This is the lab's posture and it is recorded as one: a bearer token in a URL
// is readable in shell history and in any proxy log between here and the
// server. Real auth replaces the mint, this line, and the console "mail
// transport" together.
try {
  const url = new URL(window.location.href);
  const offered = url.searchParams.get('token');
  if (offered !== null && offered !== '') {
    window.localStorage.setItem('nisc.token', offered);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.toString());
  }
} catch {
  /* storage-less context — the picker still works */
}

const terminal = mountTerminal({
  targets: {
    react: reactTarget({ root, registry: buildRegistry(), slotWrapper: lyraSlotWrapper }),
    dom: domTarget({ root }),
  },
  swapKey: 'ctrl+shift+y',
  // A shell runs on the server, keyed by principal, so a broken one is not
  // something this page can reload its way out of — refreshing reattaches to
  // it, and so does signing out and back in. This asks the server to throw it
  // away and serve the screen it would serve at sign-in.
  resetKey: 'ctrl+shift+u',
  wire: createWire(),
});

Object.assign(window, { swapTerminal: terminal.swap, resetShell: terminal.reset });
