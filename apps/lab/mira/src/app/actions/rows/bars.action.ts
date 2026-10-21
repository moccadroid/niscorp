import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { readEndpoint, readInput } from './read';
import { barsLayout } from './bars.layout';

export const barsAction: ActionDefinition = {
  id: 'rows.bars',
  title: 'Bars',
  description: 'Bars, one under another: a label each, and a bar as long as its number.',
  data: { title: '', read: '', params: {}, items: [], error: null },
  input: z.toJSONSchema(z.object(readInput('rows of label and value'))),
  layout: barsLayout,
  endpoints: { items: readEndpoint('items') },
  lifecycle: { mount: [{ call: 'items' }] },
};
