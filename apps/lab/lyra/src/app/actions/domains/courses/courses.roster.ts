import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { courseRoster } from '@lyra/app/vex/course.entries';

// WHO IS ON A BLOCK.
//
// It used to be a panel that unfolded inside the Courses screen — which is
// gone, because "Courses" and "Weekly plan" were two screens over one table and
// reading as two unrelated ideas was the whole complaint.
//
// The roster survives as what it always was: a thing you ask ABOUT one row,
// which is a sheet. It is also the cohort — the thing six separate bookings
// could not have told a studio, and the reason a course is an object at all
// rather than a tag on a class.
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
    // The course names itself from the action's own data, so nothing a request
    // carries can aim this at somebody else's block — and the engine's scope
    // would refuse it anyway.
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
