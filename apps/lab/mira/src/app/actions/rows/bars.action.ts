import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { readEndpoint, readInput } from './read';

export const barsInput = z.object(readInput('rows of label and value'));

export const barsAction: ActionDefinition = {
  id: 'rows.bars',
  title: 'Bars',
  description: 'Bars, one under another: a label each, and a bar as long as its number.',
  data: { title: '', read: '', params: {}, items: [], error: null },
  input: z.toJSONSchema(barsInput),
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
