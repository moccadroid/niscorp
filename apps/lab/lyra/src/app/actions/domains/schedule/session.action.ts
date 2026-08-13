import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

const sessionRequest = {
  fingerprint: 'session/detail',
  context: { sessionId: { $ref: '$.sessionId' } },
};

const attendingRequest = {
  fingerprint: 'session/attending',
  context: { sessionId: { $ref: '$.sessionId' } },
};

const sessionLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    {
      component: 'Hero',
      props: { eyebrow: '$.session.program_name', title: '$.session.name', lead: '$.session.day_display' },
    },
    {
      component: 'Card',
      props: { pad: 22 },
      children: {
        component: 'Row',
        props: { gap: 22, wrap: true },
        children: [
          { component: 'Stat', props: { label: 'Starts', value: '$.session.starts_at' } },
          { component: 'Stat', props: { label: 'Booked', value: '$.session.booked_display' } },
        ],
      },
    },
    {
      component: 'Section',
      props: { title: 'Who is coming', subtitle: 'Confirmed places first, then the queue.' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.attending',
            loading: '$.loading',
            rowKey: 'booking_id',
            empty: 'Nobody yet.',
            emptyHint: 'Bookings show up here as they come in.',
            columns: [
              { label: 'Member', w: 2, cell: { kind: 'primary', key: 'person_name' } },
              { label: 'Place', px: 96, align: 'right', cell: { kind: 'badge', key: 'place_label', toneKey: 'place_tone' } },
            ],
          },
        },
      },
    },
  ],
};

export const scheduleSessionAction: ActionDefinition = {
  id: 'schedule.session',
  title: 'Class',
  // `sessionId` is data, seeded by the opener through the input schema — the
  // request prisms read it from here, the way every other opened surface does.
  data: { sessionId: '', session: {}, attending: [], loading: true },
  layout: sessionLayout,
  endpoints: {
    session: { url: '/api/schedule/vex', method: 'POST', request: sessionRequest, target: 'session' },
    attending: { url: '/api/schedule/vex', method: 'POST', request: attendingRequest, target: 'attending' },
  },
  lifecycle: {
    mount: [{ call: 'session' }, { call: 'attending', onSuccess: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { message: 'my-bookings-changed', do: [{ call: 'session' }, { call: 'attending' }] },
    { message: 'check-ins-changed', do: [{ call: 'attending' }] },
    { message: 'sessions-changed', do: [{ call: 'session' }] },
  ],
};

// The opener passes the class. Rule 14: the contract is authored, not implied.
export const scheduleSessionInputSchema = z.toJSONSchema(
  z.object({ sessionId: z.string().describe('The class being looked at.') }),
);
