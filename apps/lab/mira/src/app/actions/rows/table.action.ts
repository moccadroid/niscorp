import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { readEndpoint, readInput } from './read';
import { tableLayout } from './table.layout';

export const tableAction: ActionDefinition = {
  id: 'rows.table',
  title: 'Table',
  description: 'A table: a row for each record, with the columns it is given.',
  data: { title: '', read: '', params: {}, columns: [], rows: [], error: null },
  input: z.toJSONSchema(
    z.object({
      ...readInput('rows'),
      columns: z
        .array(z.object({ key: z.string().describe('The row field it shows.'), label: z.string().describe('Its heading.') }))
        .describe('The columns, in order.'),
    }),
  ),
  layout: tableLayout,
  endpoints: { rows: readEndpoint('rows') },
  lifecycle: { mount: [{ call: 'rows' }] },
};
