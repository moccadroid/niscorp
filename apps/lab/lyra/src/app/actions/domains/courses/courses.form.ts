import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { courseRetirePrism, courseUpdatePrism, programsPrism } from './courses.prism';
import { teachersPrism } from '@lyra/app/actions/domains/timetable/timetable.prism';

// THE COURSE FORM, over the list rather than inside it. See `plans.form.ts` for
// the argument; this one had the worst of it, because a course form is eight
// fields and it unfolded under a table.
//
// It loads its OWN program options on mount rather than being handed them.
// Seeding them would have worked and would have been a lie about ownership: a
// form that cannot be opened without its opener first fetching a list is not
// separable, and the whole point of moving it out is that it is.
const courseFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'A block with an end date and a price. Joined once, and the seat is held for the whole run.' },
    { component: 'Input', props: { label: 'Name', placeholder: 'Foundations — autumn block' }, ref: 'name', model: '$.name' },
    {
      component: 'Select',
      props: { label: 'Class type', options: '$.programOptions', hint: 'What kind of class this block teaches.' },
      ref: 'programId',
      model: '$.programId',
    },
    {
      component: 'Input',
      props: { label: 'Blurb', placeholder: 'Six weeks, from nothing.' },
      ref: 'blurb',
      model: '$.blurb',
    },

    // WHEN DOES IT MEET.
    //
    // The question the form never asked. A course used to be a name, two dates
    // and a price — which describes a block that meets on no days, puts nothing
    // on a calendar, and cannot answer "when do I turn up". People could enrol
    // on it anyway.
    //
    // A course is a set of weekly slots with an end date and a price. These are
    // the slots, and the same trigger that fills the weekly timetable fills the
    // course's dates the moment this saves.
    {
      component: 'Section',
      props: { title: 'When it meets', subtitle: 'Pick the days. The classes are generated between the start and the end.' },
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          {
            component: 'Row',
            props: { gap: 8, wrap: true },
            children: [
              { component: 'DayToggle', props: { label: 'Mon' }, ref: 'mon', model: '$.mon' },
              { component: 'DayToggle', props: { label: 'Tue' }, ref: 'tue', model: '$.tue' },
              { component: 'DayToggle', props: { label: 'Wed' }, ref: 'wed', model: '$.wed' },
              { component: 'DayToggle', props: { label: 'Thu' }, ref: 'thu', model: '$.thu' },
              { component: 'DayToggle', props: { label: 'Fri' }, ref: 'fri', model: '$.fri' },
              { component: 'DayToggle', props: { label: 'Sat' }, ref: 'sat', model: '$.sat' },
              { component: 'DayToggle', props: { label: 'Sun' }, ref: 'sun', model: '$.sun' },
            ],
          },
          {
            component: 'Row',
            props: { gap: 12, wrap: true },
            children: [
              { component: 'Input', props: { label: 'Starts at', type: 'time' }, ref: 'startsAt', model: '$.startsAt' },
              { component: 'Input', props: { label: 'Minutes', type: 'number' }, ref: 'durationMins', model: '$.durationMins' },
            ],
          },
          // WHO IS TEACHING IT — a question this application stored the answer
          // to and asked nowhere a person would look.
          { component: 'Select', props: { label: 'Taught by', options: '$.teacherOptions', emptyLabel: 'Unassigned' }, ref: 'instructorId', model: '$.instructorId' },
        ],
      },
    },
    {
      component: 'Row',
      props: { gap: 12, wrap: true },
      children: [
        { component: 'Input', props: { label: 'Starts', type: 'date' }, ref: 'startsOn', model: '$.startsOn' },
        { component: 'Input', props: { label: 'Ends', type: 'date' }, ref: 'endsOn', model: '$.endsOn' },
      ],
    },
    {
      component: 'Row',
      props: { gap: 12, wrap: true },
      children: [
        { component: 'Input', props: { label: 'Places', type: 'number', hint: 'For the whole block, not per class.' }, ref: 'capacity', model: '$.capacity' },
        { component: 'Money', props: { label: 'Price', hint: 'For the whole block.' }, ref: 'priceCents', model: '$.priceCents' },
      ],
    },
    {
      component: 'Row',
      props: { gap: 10, wrap: true },
      children: [
        {
          if: '$.courseId',
          then: { component: 'Button', props: { variant: 'solid', big: true, label: 'Save', disabled: '$.saving' }, ref: 'save' },
          else: { component: 'Button', props: { variant: 'solid', big: true, label: 'Add course', disabled: '$.saving' }, ref: 'create' },
        },
        {
          if: '$.courseId',
          then: { component: 'Button', props: { variant: 'danger', big: true, label: 'Close it' }, ref: 'retire' },
          else: '',
        },
      ],
    },
  ],
};

const done = (call: string): Step => ({
  call,
  onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'courses-changed' } }, { pop: true }],
  onError: [{ set: 'saving', value: false }],
});

export const courseFormAction: ActionDefinition = {
  id: 'courses.form',
  title: '$.heading',
  data: {
    heading: 'Add a course',
    courseId: '',
    programId: '',
    programOptions: [],
    name: '',
    blurb: '',
    startsOn: '',
    endsOn: '',
    capacity: 12,
    priceCents: 0,
    // Two evenings a week is the shape almost every block has, so it is what
    // the form opens on — a default that is usually right beats a blank.
    mon: true,
    tue: false,
    wed: true,
    thu: false,
    fri: false,
    sat: false,
    sun: false,
    startsAt: '18:00',
    durationMins: 60,
    instructorId: '',
    teacherOptions: [],
    saving: false,
    error: '',
  },
  layout: courseFormLayout,
  endpoints: {
    programs: { url: '/api/schedule/vex', method: 'POST', request: programsPrism, target: 'programOptions' },
    teachers: { url: '/api/schedule/vex', method: 'POST', request: teachersPrism, target: 'teacherOptions' },
    // A FUNCTION, not a fingerprint: a course is a row AND its weekly slots,
    // which has to be one act. Every write inside it is still an ordinary
    // replay through the engine.
    create: { fn: 'courses.create', errorTarget: 'error' },
    update: { url: '/api/schedule/vex', method: 'POST', request: courseUpdatePrism, errorTarget: 'error' },
    retire: { url: '/api/schedule/vex', method: 'POST', request: courseRetirePrism, errorTarget: 'error' },
  },
  // SEED THE PICKER'S VALUE, not just its options.
  //
  // The select rendered 'Competition' as its first option while the model held
  // an empty string, so creating a course sent no class type and the database
  // answered with a foreign key constraint name. A list and a value that
  // disagree — the same defect as the effect picker, one screen over.
  lifecycle: {
    mount: [
      { call: 'programs', onSuccess: [{ set: 'programId', value: '$.programOptions.0.value' }] },
      { call: 'teachers' },
    ],
  },
  triggers: [
    // A DAY TOGGLE IS A CLICK, not a model write — Switch dispatches
    // a ui:click carrying the next state, so the value is set here rather than
    // assumed. Seven explicit triggers beat one clever binding that silently
    // does nothing, which is the failure this application keeps producing.
    { event: 'ui:click', ref: 'mon', do: [{ set: 'mon', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'tue', do: [{ set: 'tue', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'wed', do: [{ set: 'wed', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'thu', do: [{ set: 'thu', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'fri', do: [{ set: 'fri', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'sat', do: [{ set: 'sat', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'sun', do: [{ set: 'sun', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'create', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('create')] },
    { event: 'ui:click', ref: 'save', do: [{ set: 'error', value: '' }, { set: 'saving', value: true }, done('update')] },
    { event: 'ui:click', ref: 'retire', do: [{ set: 'error', value: '' }, done('retire')] },
  ],
};

export const courseFormInputSchema = z.toJSONSchema(
  z.object({
    heading: z.string().optional(),
    courseId: z.string().optional().describe('Empty means create. Set means edit that course.'),
    programId: z.string().optional(),
    name: z.string().optional(),
    blurb: z.string().optional(),
    startsOn: z.string().optional(),
    endsOn: z.string().optional(),
    capacity: z.number().optional(),
    priceCents: z.number().optional(),
  }),
);
