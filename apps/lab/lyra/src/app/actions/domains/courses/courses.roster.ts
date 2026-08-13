import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { courseRoster } from '@lyra/app/vex/course.entries';

const rosterLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 14 },
  children: [
    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Everybody who holds a place on this block.' },
    {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.roster',
          rowKey: 'enrolment_id',
          loading: '$.loading',
          empty: 'Nobody has joined yet.',
          emptyHint: 'A member joins from their own Booking screen, or the desk enrols them.',
          columns: [
            { label: 'Member', w: 2, cell: { kind: 'avatar', key: 'person_name', subKey: 'email' } },
            { label: 'Joined', px: 132, cell: { kind: 'text', key: 'enrolled_display' } },
          ],
        },
      },
    },
  ],
};

export const courseRosterAction: ActionDefinition = {
  id: 'courses.roster',
  title: '$.courseName',
  data: { courseId: '', courseName: 'Who is on this', roster: [], loading: true },
  layout: rosterLayout,
  endpoints: {
    load: { url: '/api/schedule/vex', method: 'POST', request: { fingerprint: courseRoster.fingerprint, context: { courseId: { $ref: '$.courseId' } } }, target: 'roster' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [],
};

export const courseRosterInputSchema = z.toJSONSchema(
  z.object({
    courseId: z.string().describe('The block whose cohort to show.'),
    courseName: z.string().optional(),
  }),
);
