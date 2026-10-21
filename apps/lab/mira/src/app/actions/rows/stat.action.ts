import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { readEndpoint, readInput } from './read';

export const statInput = z.object({ ...readInput, label: z.string().describe('What the number counts.') });

export const statAction: ActionDefinition = {
  id: 'rows.stat',
  title: 'Number',
  description: 'One number a read answers, as { value }, and what it counts.',
  data: { title: '', read: '', params: {}, label: '', result: { value: null }, error: null },
  input: z.toJSONSchema(statInput),
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
