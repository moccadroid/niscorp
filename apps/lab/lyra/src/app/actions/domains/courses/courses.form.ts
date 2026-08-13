import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';
import { courseCreatePrism, courseRetirePrism, courseSlotsPrism, courseUpdatePrism, programsPrism } from './courses.prism';
import { teachersPrism } from '@lyra/app/actions/domains/timetable/timetable.prism';

// THE CHECK THAT WAS ONCE MISSING ENTIRELY, now held by the button instead of
// a thrown error: a course with no days is a course with no classes, and the
// form refuses to submit one — along with a blank name, missing dates, or an
// end before the start. Recomputed whenever a day is toggled or a field typed.
const createBlocked = {
  $prism: {
    $or: [
      { $not: { $or: [{ $ref: '$.mon' }, { $ref: '$.tue' }, { $ref: '$.wed' }, { $ref: '$.thu' }, { $ref: '$.fri' }, { $ref: '$.sat' }, { $ref: '$.sun' }] } },
      { $eq: [{ $trim: { $ref: '$.name' } }, ''] },
      { $eq: [{ $ref: '$.startsOn' }, ''] },
      { $eq: [{ $ref: '$.endsOn' }, ''] },
      { $gt: [{ $ref: '$.startsOn' }, { $ref: '$.endsOn' }] },
    ],
  },
};

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
          // Stored on the row, so it has to be askable somewhere.
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
          else: { component: 'Button', props: { variant: 'solid', big: true, label: 'Add course', disabled: '$.blocked' }, ref: 'create' },
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
    // The create button starts held down: the default days are ticked but the
    // name and dates are blank. Edit mode never reads it (Save has its own).
    blocked: true,
    created: {},
    error: '',
  },
  layout: courseFormLayout,
  endpoints: {
    programs: { url: '/api/schedule/vex', method: 'POST', request: programsPrism, target: 'programOptions' },
    teachers: { url: '/api/schedule/vex', method: 'POST', request: teachersPrism, target: 'teacherOptions' },
    // Two replays where a server function used to loop: the course row first
    // (RETURNING hands back the DB-minted id as `$.created`), then every
    // chosen day's slot in ONE `insertEach` statement.
    create: { url: '/api/schedule/vex', method: 'POST', request: courseCreatePrism, target: 'created', errorTarget: 'error' },
    slots: { url: '/api/schedule/vex', method: 'POST', request: courseSlotsPrism, errorTarget: 'error' },
    update: { url: '/api/schedule/vex', method: 'POST', request: courseUpdatePrism, errorTarget: 'error' },
    retire: { url: '/api/schedule/vex', method: 'POST', request: courseRetirePrism, errorTarget: 'error' },
  },
  lifecycle: {
    mount: [
      { call: 'programs', onSuccess: [{ set: 'programId', value: '$.programOptions.0.value' }] },
      { call: 'teachers' },
    ],
  },
  triggers: [
    // A day toggle is a CLICK, not a model write: Switch dispatches a ui:click
    // carrying the next state, so the value is set here rather than assumed.
    { event: 'ui:click', ref: 'mon', do: [{ set: 'mon', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'tue', do: [{ set: 'tue', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'wed', do: [{ set: 'wed', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'thu', do: [{ set: 'thu', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'fri', do: [{ set: 'fri', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'sat', do: [{ set: 'sat', value: '@event.payload.next' }] },
    { event: 'ui:click', ref: 'sun', do: [{ set: 'sun', value: '@event.payload.next' }] },
    // The gate, re-answered after every change that could move it. Separate
    // triggers, not extra steps: buffered sets in one trigger resolve against
    // the same pre-write snapshot, so a shared buffer would read stale toggles.
    { event: 'ui:click', ref: 'mon', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:click', ref: 'tue', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:click', ref: 'wed', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:click', ref: 'thu', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:click', ref: 'fri', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:click', ref: 'sat', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:click', ref: 'sun', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:model', ref: 'name', do: [{ set: 'name', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'startsOn', do: [{ set: 'startsOn', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'endsOn', do: [{ set: 'endsOn', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'name', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:model', ref: 'startsOn', do: [{ set: 'blocked', value: createBlocked }] },
    { event: 'ui:model', ref: 'endsOn', do: [{ set: 'blocked', value: createBlocked }] },
    {
      event: 'ui:click',
      ref: 'create',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        { set: 'blocked', value: true },
        {
          call: 'create',
          onSuccess: [
            {
              call: 'slots',
              onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'courses-changed' } }, { pop: true }],
              onError: [{ set: 'saving', value: false }, { set: 'blocked', value: createBlocked }],
            },
          ],
          onError: [{ set: 'saving', value: false }, { set: 'blocked', value: createBlocked }],
        },
      ],
    },
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
