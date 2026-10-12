import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { createSlotWrapper } from './ui/slot-wrapper';
import './ui/css/theme.css';
import './ui/css/ui.css';

// A chrome-extension:// origin has no serving host to derive the socket url
// from, so the url is explicit.
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
