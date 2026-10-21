import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { counterLayout } from './counter.layout';

export const counterAction: ActionDefinition = {
  id: 'guide.counter',
  title: 'Counter',
  description: 'A counter a person presses: a number, buttons that count it up and down, and one that starts it over. Shows that a card is data, and a press a change to it.',
  data: { title: 'Press me', count: 0 },
  input: z.toJSONSchema(
    z.object({
      title: z.string().optional().describe('What it counts, in a few words.'),
      count: z.number().int().optional().describe('The number it starts at.'),
    }),
  ),
  layout: counterLayout,
  triggers: [
    { event: 'ui:click', ref: 'up', do: [{ increment: 'count' }] },
    { event: 'ui:click', ref: 'down', do: [{ decrement: 'count' }] },
    { event: 'ui:click', ref: 'reset', do: [{ reset: 'count' }] },
  ],
};
