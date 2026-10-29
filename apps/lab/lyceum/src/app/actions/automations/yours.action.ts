import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { timersSaved } from '@lyceum/app/vex/timer.entries';

// A member's automations, on their phone. Their assistant writes one; it runs
// as them, and all it can do is show them a message (server/timing.ts).
export const yoursAction: ActionDefinition = {
  id: 'automations.yours',
  title: 'Your automations',
  description: 'The automations this person saved: what each one does and when it fires.',
  data: { timers: [] },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'list'] },
    children: [
      { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'Your automations' }] },
      {
        component: 'Cell',
        props: { area: 'list' },
        children: [
          {
            if: '$.timers',
            then: { for: '$.timers', as: 't', key: 'timer_id', do: { component: 'Text', children: '{{$t.intent}}' } },
            else: { component: 'Text', props: { tone: 'muted' }, children: 'Ask your assistant for a reminder, in a few minutes.' },
          },
        ],
      },
    ],
  },
  endpoints: { timers: { url: '/api/vex', method: 'POST', request: { fingerprint: timersSaved.fingerprint, context: {} }, target: 'timers' } },
  lifecycle: { mount: [{ call: 'timers' }] },
  triggers: [],
};

export const memberNotificationAction: ActionDefinition = {
  id: 'member.notification',
  description: 'A message from one of this person’s saved automations, shown over their screen until they close it.',
  title: 'Notification',
  data: { text: '', sheetTitle: 'Notification' },
  input: z.toJSONSchema(z.object({ text: z.string().optional().describe('The words of the notification.'), sheetTitle: z.string().optional().describe('The title over it.') })),
  layout: {
    component: 'Sheet',
    props: { areas: ['text'] },
    children: [{ component: 'Cell', props: { area: 'text', ink: 'alert' }, children: [{ component: 'Headline', props: { level: 'name' }, children: '{{$.text}}' }] }],
  },
  triggers: [],
};
