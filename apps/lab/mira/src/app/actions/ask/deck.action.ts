import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { deckLayout } from './deck.layout';

export const deckAction: ActionDefinition = {
  id: 'ask.deck',
  title: 'Every answer',
  description: 'Every answer in the stack side by side, each a small picture of its screen with what was asked and what the model said it did; the one pressed is opened.',
  data: { selected: 1, answers: [] },
  input: z.toJSONSchema(z.object({ selected: z.number().int().min(1).describe('The position of the answer picked when it opens: the one shown.') })),
  layout: deckLayout,
  endpoints: { deck: { fn: 'answers.deck', target: 'answers' } },
  lifecycle: { mount: [{ call: 'deck' }], unmount: [{ emit: { channel: 'deck-closed' } }] },
  triggers: [
    { event: 'ui:model', ref: 'deck', do: [{ emit: { channel: 'deck-selected', payload: '$.selected' } }] },
    { event: 'ui:click', ref: 'mini', do: [{ emit: { channel: 'go', payload: '@event.payload' } }, { removeSelf: true }] },
    { message: 'deck-pick', do: [{ set: 'selected', value: '@event.payload' }] },
    { message: 'deck-close', do: [{ removeSelf: true }] },
  ],
};
