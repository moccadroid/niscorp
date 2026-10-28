import type { ActionDefinition, Step } from '@niscorp/nova';
import { z } from 'zod';
import { deckLayout } from './deck.layout';
import { pickAfterClosePrism } from './deck.prism';

// Closing a picture closes its answer; what is shown, and the stack the dock names, follow.
const close: Step[] = [
  {
    call: 'close',
    onSuccess: [{ set: 'selected', value: { $prism: pickAfterClosePrism } }, { emit: { channel: 'deck-selected', payload: '$.selected' } }, { emit: { channel: 'answer-closed' } }],
  },
];

export const deckAction: ActionDefinition = {
  id: 'ask.deck',
  title: 'Every answer',
  description: 'Every answer in the stack side by side, each a small picture of its screen with what was asked and what was said back; the one pressed is opened, one swiped up or closed is closed.',
  data: { selected: 1, answers: [], closing: 0 },
  input: z.toJSONSchema(z.object({ selected: z.number().int().min(1).describe('The position of the answer picked when it opens: the one shown.') })),
  layout: deckLayout,
  endpoints: { deck: { fn: 'answers.deck', target: 'answers' }, close: { fn: 'answers.close', target: 'answers' } },
  lifecycle: { mount: [{ call: 'deck' }], unmount: [{ emit: { channel: 'deck-closed' } }] },
  triggers: [
    { event: 'ui:model', ref: 'deck', do: [{ emit: { channel: 'deck-selected', payload: '$.selected' } }] },
    { event: 'ui:click', ref: 'mini', do: [{ emit: { channel: 'go', payload: '@event.payload' } }, { removeSelf: true }] },
    { message: 'deck-pick', do: [{ set: 'selected', value: '@event.payload' }] },
    { message: 'deck-close', do: [{ removeSelf: true }] },
    { event: 'ui:click', ref: 'close', do: [{ set: 'closing', value: '@event.payload' }, ...close] },
    { event: 'ui:key', ref: 'mini', key: 'Delete', do: [{ set: 'closing', value: '@event.payload' }, ...close] },
    { message: 'deck-close-picked', do: [{ set: 'closing', from: 'selected' }, ...close] },
  ],
};
