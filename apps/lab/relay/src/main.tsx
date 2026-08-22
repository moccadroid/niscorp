import { createWire } from '@niscorp/moss/client';
import { mountTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import { createSlotWrapper } from './ui/slot-wrapper';
import { registerNav } from './lib/nav';
import './ui/css/theme.css';
import './ui/css/ui.css';

// Relay's entire browser: its design-system registry + slotWrapper, handed to
// moss's terminal. The wire, the mount, the render targets, and the live-swap
// hotkey are all moss's — relay owns only its kit. `react` is relay's real
// styled UI; `dom` is moss's zero-config plain-DOM terminal. Ctrl+Shift+Y
// swaps them live, over ONE wire (created here, injected — the slotWrapper
// closes over it for the devtools chip), so the session survives the switch.
// (Not Ctrl+Shift+T — that reopens the last closed tab, uninterceptable.)
const root = document.getElementById('root');
if (root === null) throw new Error('No root element');

const wire = createWire();
// The kit's navigation seam: components (the stack chip) navigate through
// these rather than reaching for a wire they cannot see.
registerNav({ back: () => wire.back(), popTo: (canvas, instance) => wire.popTo(canvas, instance) });
const terminal = mountTerminal({
  targets: {
    react: reactTarget({ root, registry: buildRegistry(), slotWrapper: createSlotWrapper(wire) }),
    dom: domTarget({ root }),
  },
  swapKey: 'ctrl+shift+y',
  wire,
});

// Dev convenience: also expose the swap on the console, so the render target
// can be flipped even if the hotkey combo is intercepted by the browser.
Object.assign(window, { swapTerminal: terminal.swap });
console.info('[relay] render-target swap: press Ctrl+Shift+Y, or run swapTerminal() in the console.');
