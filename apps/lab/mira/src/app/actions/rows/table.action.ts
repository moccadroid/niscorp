import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { readEndpoint, readInput } from './read';

export const tableInput = z.object({
  ...readInput('rows'),
  columns: z.array(z.object({ key: z.string(), label: z.string() })).describe('The columns, in order: the row field each shows, and its heading.'),
});

export const tableAction: ActionDefinition = {
  id: 'rows.table',
  title: 'Table',
  description: 'A table: a row for each record, with the columns it is given.',
  data: { title: '', read: '', params: {}, columns: [], rows: [], error: null },
  input: z.toJSONSchema(tableInput),
  layout: {
    component: 'Card',
    props: { title: '{{$.title}}' },
    children: [
      {
        if: '$.error',
        then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error.message}}' },
        else: { component: 'Table', props: { columns: '$.columns', rows: '$.rows' } },
      },
    ],
  },
  endpoints: { rows: readEndpoint('rows') },
  lifecycle: { mount: [{ call: 'rows' }] },
};
