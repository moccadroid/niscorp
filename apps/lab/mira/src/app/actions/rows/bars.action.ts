import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { readEndpoint, readInput } from './read';

export const barsAction: ActionDefinition = {
  id: 'rows.bars',
  title: 'Bars',
  description: 'Values side by side as bars: a read that answers rows of { label, value }.',
  data: { title: '', read: '', params: {}, items: [], error: null },
  input: z.toJSONSchema(z.object(readInput)),
  layout: {
    component: 'Card',
    props: { title: '{{$.title}}' },
    children: [
      {
        if: '$.error',
        then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error.message}}' },
        else: { component: 'Bars', props: { items: '$.items' } },
      },
    ],
  },
  endpoints: { items: readEndpoint('items') },
  lifecycle: { mount: [{ call: 'items' }] },
};
