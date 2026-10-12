import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { createSlotWrapper } from './ui/slot-wrapper';
import { registerNav } from './lib/nav';
import './ui/css/theme.css';
import './ui/css/ui.css';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

const wire = createWire();
registerNav({ back: () => wire.back(), popTo: (canvas, instance) => wire.popTo(canvas, instance) });
const terminal = mountTerminal({
  targets: {
    react: reactTarget({ root, registry: buildRegistry(), slotWrapper: createSlotWrapper(wire) }),
    dom: domTarget({ root }),
  },
  swapKey: 'ctrl+shift+y',
  wire,
});

Object.assign(window, { swapTerminal: terminal.swap });
console.info('[relay] render-target swap: press Ctrl+Shift+Y, or run swapTerminal() in the console.');
