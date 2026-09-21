import type { ActionDefinition } from '@niscorp/nova';
import { roomXrayLayout } from './room-xray.layout';

// X-RAY — the one switch between the app and its instruments.
//
// THREE LAYERS THAT NEVER MIX (PLAN.md § The surface). What an operator sees is
// the APP: the line, the answer, cards, a quiet history. Why a card is there is
// a line per card, on demand. Everything else — probabilities, model names,
// timings, the trace, the director — is X-RAY, and with this off none of it is
// in the tree the terminal is sent: every such element is behind a layout `if`
// on a data key the loop writes into every card, or is a different arrangement
// swapped with `shell.setLayout`. No CSS hides anything.
//
// The switch is the operator's: a click here, or the backtick key. It calls an
// endpoint; the loop flips the room.
export const ROOM_XRAY_ID = 'room.xray';

export const roomXrayAction: ActionDefinition = {
  id: ROOM_XRAY_ID,
  title: 'X-ray',
  description: 'The switch between the app and its instruments: off, the room an operator would see; on, how it decided — probabilities, models, timings, the trace and the demo controls.',
  data: { on: false, command: 'toggle' },
  layout: roomXrayLayout,
  endpoints: { toggle: { fn: 'encore.xray', target: 'on' } },
  // Two refs, one endpoint: siblings in a layout are keyed by ref, so the key
  // and the button cannot share one.
  triggers: [
    { event: 'ui:click', ref: 'toggle', do: [{ set: 'command', value: 'toggle' }, { call: 'toggle' }] },
    { event: 'ui:click', ref: 'hotkey', do: [{ set: 'command', value: 'toggle' }, { call: 'toggle' }] },
    // NEVER STICKY. A freshly loaded page that finds x-ray on turns it off: the
    // kit's `OnLoad` clicks this once per page load, and only while `on` holds.
    // (moss tells an app when a shell is BUILT, not when a terminal attaches to
    // one that already exists — so the arrival is noticed from the terminal.)
    { event: 'ui:click', ref: 'fresh', do: [{ set: 'command', value: 'off' }, { call: 'toggle' }] },
  ],
};
