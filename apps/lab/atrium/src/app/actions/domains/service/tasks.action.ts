import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { serviceTasksLayout } from './tasks.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { myTasksPrism, setTaskStatusPrism } from './service.prism';

// The maintenance and housekeeping surface. One list, three big targets, nothing
// else — this runs on a phone held in one hand, sometimes with a glove on.
//
// It is the same shell, the same frame and the same kit as the manager's screen.
// The difference is entirely which actions resolved, which is the claim.
export const serviceTasksAction: ActionDefinition = {
  id: 'service.tasks',
  title: 'My work',
  data: { staffId: '', propertyId: '', scope: 'open', rows: [], toggleId: '', toggleStatus: '', loading: true, expanded: true },
  layout: previewable(
    crewCard('My work', 'wrench', { $if: '$.rows.length', $then: 'Next: {{$.rows.0.title}}', $else: 'Nothing assigned. Good.' }),
    serviceTasksLayout,
  ),
  endpoints: {
    load: { url: '/api/service/vex', method: 'POST', request: myTasksPrism, target: 'rows' },
    setStatus: { url: '/api/service/vex', method: 'POST', request: setTaskStatusPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'tab', do: [{ set: 'scope', value: '@event.payload' }, { call: 'load' }] },
    {
      event: 'ui:click',
      ref: 'done',
      do: [
        { set: 'toggleId', value: '@event.payload.task_id' },
        { set: 'toggleStatus', value: 'done' },
        { call: 'setStatus', onSuccess: [{ call: 'load' }, { emit: { channel: 'tasks-changed' } }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'reopen',
      do: [
        { set: 'toggleId', value: '@event.payload.task_id' },
        { set: 'toggleStatus', value: 'open' },
        { call: 'setStatus', onSuccess: [{ call: 'load' }, { emit: { channel: 'tasks-changed' } }] },
      ],
    },
    { message: 'tasks-changed', do: [{ call: 'load' }] },
    ...previewTriggers,
  ],
};

export const serviceTasksInputSchema = z.toJSONSchema(
  z.object({
    scope: z.enum(['open', 'done', 'all']).optional(),
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    staffId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full list.'),
  }),
);
