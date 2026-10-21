import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { readEndpoint, readInput } from './read';

export const statAction: ActionDefinition = {
  id: 'rows.stat',
  title: 'Number',
  description: 'One number in large type, with what it counts beneath it.',
  data: { title: '', read: '', params: {}, label: '', result: { value: null }, error: null },
  input: z.toJSONSchema(z.object({ ...readInput('{ value }'), label: z.string().describe('What the number counts, shown beneath it.') })),
  layout: {
    component: 'Card',
    props: { title: '{{$.title}}' },
    children: [
      {
        if: '$.error',
        then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error.message}}' },
        else: { component: 'Stat', props: { value: '$.result.value', label: '$.label' } },
      },
    ],
  },
  endpoints: { value: readEndpoint('result') },
  lifecycle: { mount: [{ call: 'value' }] },
};
