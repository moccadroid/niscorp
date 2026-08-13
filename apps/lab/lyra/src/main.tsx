import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { lyraSlotWrapper } from './ui/slot-wrapper';
import './ui/css/theme.css';
import './ui/css/ui.css';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

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
  resetKey: 'ctrl+shift+u',
  wire: createWire(),
});

Object.assign(window, { swapTerminal: terminal.swap, resetShell: terminal.reset });
