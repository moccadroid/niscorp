import type { ActionDefinition } from '@niscorp/nova';
import { intentOptionsLayout } from './intent-options.layout';

// THE MIDDLE BAND, as chips.
//
// Probability is assertiveness: high mounts the card, low shows nothing, and
// what sits between is OFFERED — a chip naming the card and how sure the model
// was. The loop writes `chips` straight into this instance on every pass, so
// the strip is a projection of the last decision rather than something that
// loads.
//
// A click is a vote: it promotes that card to mounted and pins it for as long
// as the sentence stands, whatever later passes score it. The pin lives in the
// loop, not here — a chip knows its action id and nothing else.
export const intentOptionsAction: ActionDefinition = {
  id: 'intent.options',
  title: 'Maybe',
  description: 'Cards the model is unsure about, offered as chips the operator can promote with a click.',
  // `say` is the room accounting for itself when the canvases are empty: the
  // loop writes one plain sentence here, or nothing (reconcile.ts).
  // `idle` is the room with nothing in it and nothing asked of it: one quiet
  // sentence instead of a blank, written by the loop, gone at the first key.
  data: { chips: [], xray: false, say: '', idle: 'Nothing needs attention right now. Say what is happening.', promoteId: '', promoted: 0 },
  layout: intentOptionsLayout,
  endpoints: {
    promote: { fn: 'encore.promote', target: 'promoted' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'chip',
      do: [{ set: 'promoteId', value: '@event.payload' }, { call: 'promote' }],
    },
  ],
};
