import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { createSlotWrapper } from './ui/slot-wrapper';
import './ui/css/theme.css';
import './ui/css/ui.css';

// Relay as a Chrome extension surface — the side panel and the DevTools
// "Relay" tab both load this page. It is main.tsx with one assumption
// removed: a chrome-extension:// origin has no serving host to derive the
// socket url from, so the url is explicit (localStorage['relay.url']
// overrides the localhost default — set it from this page's own console).
// The token lives in the extension origin's localStorage, so every surface
// (panel, devtools, popup) is ONE session — sign in once.
const url = window.localStorage.getItem('relay.url') ?? 'ws://localhost:8787/socket';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

const wire = createWire({ url });
const terminal = mountTerminal({
  targets: {
    react: reactTarget({ root, registry: buildRegistry(), slotWrapper: createSlotWrapper(wire) }),
    dom: domTarget({ root }),
  },
  swapKey: 'ctrl+shift+y',
  wire,
});

Object.assign(window, { swapTerminal: terminal.swap });
console.info(`[relay/extension] wire → ${url} — override via localStorage.setItem('relay.url', 'ws://…') and reload.`);
