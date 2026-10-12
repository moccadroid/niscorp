import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';

export const xrayDocumentAction: ActionDefinition = {
  id: 'xray.document',
  description: 'One action on the person\'s screen, as the JSON document it is: its data, endpoints, triggers and layout.',
  title: 'X-ray',
  data: { instanceId: '', document: { json: '' }, sheetTitle: '', error: '' },
  input: z.toJSONSchema(
    z.object({
      instanceId: z.string().optional().describe('Which action instance on the screen.'),
    }),
  ),
  layout: {
    component: 'Sheet',
    props: { areas: ['json'] },
    children: [
      {
        component: 'Cell',
        // No scroll of its own: the sheet's body scrolls.
        props: { area: 'json' },
        children: [{ if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' }, else: { component: 'Code', props: { text: '$.document.json' } } }],
      },
    ],
  },
  endpoints: { document: { fn: 'xray.document', target: 'document', errorTarget: 'error' } },
  lifecycle: { mount: [{ call: 'document' }] },
  triggers: [],
};
