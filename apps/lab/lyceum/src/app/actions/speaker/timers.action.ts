import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { timersSaved } from '@lyceum/app/vex/timer.entries';

// Delete runs a function: the row goes, as the speaker, and tide unloads the
// timer, which a write alone would not do.
export const timersAction: ActionDefinition = {
  id: 'speaker.timers',
  description: 'The saved timers (automations): each one with what it does and when it fires, and a Delete button the person presses themselves. Open it when they ask to see, cancel, stop or delete a saved timer.',
  title: 'Saved timers',
  data: { sheetTitle: 'Saved timers', about: '', timers: [], picked: { timer_id: '' }, error: '' },
  input: z.toJSONSchema(
    z.object({
      about: z.string().optional().describe('Which saved timer the person means, in a few of their own words — shown above the list. They pick and delete it themselves.'),
    }),
  ),
  layout: {
    component: 'Sheet',
    props: { areas: ['about', 'list', 'out'] },
    children: [
      { if: '$.about', then: { component: 'Cell', props: { area: 'about', ink: 'highlight' }, children: [{ component: 'Label', children: 'You asked about' }, { component: 'Text', children: '{{$.about}}' }] } },
      {
        component: 'Cell',
        props: { area: 'list', pad: 'none' },
        children: [
          {
            if: '$.timers',
            then: {
              for: '$.timers',
              as: 't',
              key: 'timer_id',
              do: {
                component: 'Sheet',
                props: { areas: ['what when', 'delete delete'], cols: [2, 1] },
                children: [
                  { component: 'Cell', props: { area: 'what' }, children: [{ component: 'Label', children: 'Saved timer' }, { component: 'Text', children: '{{$t.intent}}' }] },
                  { component: 'Cell', props: { area: 'when', ink: 'live' }, children: [{ component: 'Countdown', props: { label: 'Fires in', to: '$t.due_at' } }] },
                  { component: 'Action', ref: 'delete', props: { area: 'delete', ink: 'alert', label: 'Delete this timer', value: '$t' } },
                ],
              },
            },
            else: { component: 'Cell', children: [{ component: 'Text', props: { tone: 'muted' }, children: 'No saved timers.' }] },
          },
        ],
      },
      { if: '$.error', then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] } },
    ],
  },
  endpoints: {
    timers: { url: '/api/vex', method: 'POST', request: { fingerprint: timersSaved.fingerprint, context: {} }, target: 'timers' },
    delete: { fn: 'timers.delete', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'timers' }] },
  triggers: [
    { event: 'ui:click', ref: 'delete', do: [{ set: 'error', value: '' }, { set: 'picked', value: '@event.payload' }, { call: 'delete' }] },
  ],
};
