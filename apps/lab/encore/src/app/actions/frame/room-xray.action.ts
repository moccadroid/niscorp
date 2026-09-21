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
  data: { on: false },
  layout: roomXrayLayout,
  endpoints: { toggle: { fn: 'encore.xray', target: 'on' } },
  // Two refs, one endpoint: siblings in a layout are keyed by ref, so the key
  // and the button cannot share one.
  triggers: [
    { event: 'ui:click', ref: 'toggle', do: [{ call: 'toggle' }] },
    { event: 'ui:click', ref: 'hotkey', do: [{ call: 'toggle' }] },
  ],
};
