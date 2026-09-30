import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';

// ONE ACTION ON THE SCREEN, AS THE DOCUMENT IT IS — opened over the screen when
// somebody with the X-ray on taps an action's id (member/phone.action.ts). Its
// definition as the shell runs it for them, with its data as it stands now
// (server/functions/xray.functions.ts). Only for a person given the X-ray.
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
        props: { area: 'json', scroll: 'y' },
        children: [{ if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' }, else: { component: 'Code', props: { text: '$.document.json' } } }],
      },
    ],
  },
  endpoints: { document: { fn: 'xray.document', target: 'document', errorTarget: 'error' } },
  lifecycle: { mount: [{ call: 'document' }] },
  triggers: [],
};
