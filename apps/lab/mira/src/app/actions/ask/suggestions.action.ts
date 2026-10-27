import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { suggestionsLayout } from './suggestions.layout';

export const suggestionsAction: ActionDefinition = {
  id: 'ask.suggestions',
  title: 'Try asking',
  description: 'Things to ask, each sent to the line when it is pressed.',
  data: { title: '', suggestions: [] },
  input: z.toJSONSchema(
    z.object({
      title: z.string().describe('A few words over the suggestions.'),
      suggestions: z.array(z.string()).describe('Each a message to send, as a person would type it.'),
    }),
  ),
  layout: suggestionsLayout,
  triggers: [{ event: 'ui:click', ref: 'suggestion', do: [{ emit: { channel: 'ask', payload: '@event.payload' } }] }],
};
