import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { readEndpoint, readInput } from './read';
import { statLayout } from './stat.layout';

export const statAction: ActionDefinition = {
  id: 'rows.stat',
  title: 'Number',
  description: 'One number in large type, with what it counts beneath it.',
  data: { title: '', read: '', params: {}, label: '', result: { value: null }, error: null },
  input: z.toJSONSchema(z.object({ ...readInput('{ value }'), label: z.string().describe('What the number counts, shown beneath it.') })),
  layout: statLayout,
  endpoints: { value: readEndpoint('result') },
  lifecycle: { mount: [{ call: 'value' }] },
};
