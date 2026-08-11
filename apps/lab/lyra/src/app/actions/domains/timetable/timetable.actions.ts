import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { eventFormLayout, programsLayout, timetableFormLayout, timetableListLayout } from './timetable.layouts';
import {
  programCreatePrism,
  programUpdatePrism,
  programsPrism,
  sessionCancelPrism,
  sessionRestorePrism,
  teachersPrism,
  templateByIdPrism,
  templateCreatePrism,
  templateRestorePrism,
  templateRetirePrism,
  templateUpdatePrism,
  templatesPrism,
  eventCreatePrism,
} from './timetable.prism';

const WEEKDAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

// ── the grid ─────────────────────────────────────────────────
export const timetableListAction: ActionDefinition = {
  id: 'timetable.list',
  title: 'Classes',
  data: {
    templates: [],
    loading: true,
    pendingTemplateId: '',
    error: '',
  },
  layout: timetableListLayout,
  endpoints: {
    load: { url: '/api/schedule/vex', method: 'POST', request: templatesPrism, target: 'templates' },
    retire: { url: '/api/schedule/vex', method: 'POST', request: templateRetirePrism, errorTarget: 'error' },
    restore: { url: '/api/schedule/vex', method: 'POST', request: templateRestorePrism, errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }],
    // Coming back from the form: re-read rather than trust what was left
    // behind.
    resume: [{ call: 'load' }],
  },
  triggers: [
    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'timetable.form', canvas: 'sheet', with: ['sheet'], input: { templateId: '', heading: 'Add a class' } } }] },
    { event: 'ui:click', ref: 'addEvent', do: [{ push: { action: 'timetable.event', canvas: 'sheet', with: ['sheet'], input: { heading: 'Add a one-off' } } }] },
    // A COURSE IS ADDED FROM HERE TOO. It is the same kind of thing with an end
    // date and a price, so it belongs behind a button on this screen rather
    // than behind a different screen entirely.
    { event: 'ui:click', ref: 'addCourse', do: [{ push: { action: 'courses.form', canvas: 'sheet', with: ['sheet'], input: { heading: 'Add a course' } } }] },
    // Who is on a block. Only course rows offer it.
    { event: 'ui:click', ref: 'roster', do: [{ push: { action: 'courses.roster', canvas: 'sheet', with: ['sheet'], input: { courseId: '@event.payload.course_id', courseName: '@event.payload.name' } } }] },
    { message: 'courses-changed', do: [{ call: 'load' }] },
    { event: 'ui:click', ref: 'edit', do: [{ push: { action: 'timetable.form', canvas: 'sheet', with: ['sheet'], input: { templateId: '@event.payload.template_id', heading: 'Edit class' } } }] },
    {
      event: 'ui:click',
      ref: 'retire',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingTemplateId', value: '@event.payload.template_id' },
        // `sessions-changed` because retiring a slot removes future classes —
        // the trigger does that, and every surface showing a timetable needs
        // to hear it.
        { call: 'retire', onSuccess: [{ call: 'load' }, { emit: { channel: 'sessions-changed' } }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'restore',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingTemplateId', value: '@event.payload.template_id' },
        { call: 'restore', onSuccess: [{ call: 'load' }, { emit: { channel: 'sessions-changed' } }] },
      ],
    },
    { message: 'sessions-changed', do: [{ call: 'load' }] },
  ],
};

export const timetableListInputSchema = z.toJSONSchema(z.object({}));

// ── the slot form ────────────────────────────────────────────
//
// One form, create and edit. Loaded bare it creates; loaded with a template id
// it edits — the working pattern, and the reason there is no "new class" screen
// separate from this one.
export const timetableFormAction: ActionDefinition = {
  id: 'timetable.form',
  // The SHEET renders this, so it has to be the real heading. It said "Class"
  // while the body said "Add a class" — the same thing titled twice, differently.
  title: '$.heading',
  data: {
    heading: 'Add a class',
    templateId: '',
    // The editable slot, every key defaulted so a bare load is a usable form
    // rather than an empty one.
    name: '',
    programId: '',
    weekday: '1',
    startsAt: '18:00',
    durationMins: 60,
    capacity: 20,
    instructorId: '',
    // Option lists, fetched rather than authored — a studio's programs and
    // teachers are its own.
    programOptions: [],
    teacherOptions: [],
    weekdayOptions: WEEKDAYS,
    loaded: {},
    saving: false,
    error: '',
  },
  layout: timetableFormLayout,
  endpoints: {
    programs: { url: '/api/schedule/vex', method: 'POST', request: programsPrism, target: 'programOptions' },
    teachers: { url: '/api/schedule/vex', method: 'POST', request: teachersPrism, target: 'teacherOptions' },
    load: { url: '/api/schedule/vex', method: 'POST', request: templateByIdPrism, target: 'loaded' },
    create: { url: '/api/schedule/vex', method: 'POST', request: templateCreatePrism, errorTarget: 'error' },
    update: { url: '/api/schedule/vex', method: 'POST', request: templateUpdatePrism, errorTarget: 'error' },
  },
  lifecycle: {
    mount: [
      // Options first — a Select whose options arrive after its value has
      // nothing to show for it.
      // The reads hand back option shapes already, and the Select supplies its
      // own "Unassigned" entry. A trigger's `set` resolves bindings but does
      // NOT evaluate Prism ops, so mapping rows into `{ value, label }` here
      // would send the expression itself to the browser — where the component
      // throws on it and takes the page down with it.
      { call: 'programs' },
      { call: 'teachers' },
      // Then the record, when there is one. Loaded bare, `templateId` is empty
      // and this read answers the empty shape — which is exactly the blank form.
      {
        call: 'load',
        onSuccess: [
          { set: 'name', value: '$.loaded.name' },
          { set: 'programId', value: '$.loaded.program_id' },
          { set: 'weekday', value: '$.loaded.weekday' },
          { set: 'startsAt', value: '$.loaded.starts_at' },
          { set: 'durationMins', value: '$.loaded.duration_mins' },
          { set: 'capacity', value: '$.loaded.capacity' },
          { set: 'instructorId', value: '$.loaded.instructor_id' },
        ],
      },
    ],
  },
  triggers: [
    // Create and update are different statements and the trigger grammar has no
    // conditional, so they are different refs — and the layout shows whichever
    // one applies. Branching on the template id is branching on ordinary DATA,
    // which is fine: rule 11 forbids branching on ROLES, not on values.
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        {
          call: 'update',
          onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'sessions-changed' } }, { pop: true }],
          onError: [{ set: 'saving', value: false }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'create',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        {
          call: 'create',
          onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'sessions-changed' } }, { pop: true }],
          onError: [{ set: 'saving', value: false }],
        },
      ],
    },
  ],
};

export const timetableFormInputSchema = z.toJSONSchema(
  z.object({
    templateId: z.string().optional().describe('The slot being edited. Absent or empty, the form creates.'),
  }),
);

// ── programs ─────────────────────────────────────────────────
export const programsAction: ActionDefinition = {
  id: 'programs.list',
  title: 'Class types',
  data: { programs: [], loading: true },
  layout: programsLayout,
  endpoints: {
    load: { url: '/api/schedule/vex', method: 'POST', request: programsPrism, target: 'programs' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    // OPEN THE FORM, do not become it. Same move as the plan list: the screen
    // stopped holding a draft program and now seeds one into the sheet.
    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'programs.form', canvas: 'sheet', with: ['sheet'], input: { heading: 'Add a class type' } } }] },
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'programs.form',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              heading: 'Edit class type',
              programId: '@event.payload.program_id',
              name: '@event.payload.name',
              blurb: '@event.payload.blurb',
              colour: '@event.payload.tone',
            },
          },
        },
      ],
    },
    // The form announces; this listens.
    { message: 'sessions-changed', do: [{ call: 'load' }] },
  ],
};

export const programsInputSchema = z.toJSONSchema(z.object({}));

// ── a one-off ────────────────────────────────────────────────
//
// Its own action rather than a mode on the slot form, for the same reason the
// roll and the sign-up are separate: they are different things to be looking
// at. A weekly rule has a weekday and no date; a one-off has a date and no
// weekday, and one form carrying both would spend its life explaining which
// half to ignore.
//
// This is the only write in the application that makes a `class_sessions` row
// directly. Everywhere else they are derived from a template by a trigger —
// which is why `template_id` being nullable was already the whole feature, and
// this is only the screen that was missing.
export const eventFormAction: ActionDefinition = {
  id: 'timetable.event',
  title: '$.heading',
  data: {
    heading: 'Add a one-off',
    name: '',
    programId: '',
    heldOn: '',
    startsAt: '18:00',
    durationMins: 90,
    capacity: 20,
    instructorId: '',
    programOptions: [],
    teacherOptions: [],
    saving: false,
    error: '',
  },
  layout: eventFormLayout,
  endpoints: {
    programs: { url: '/api/schedule/vex', method: 'POST', request: programsPrism, target: 'programOptions' },
    teachers: { url: '/api/schedule/vex', method: 'POST', request: teachersPrism, target: 'teacherOptions' },
    create: { url: '/api/schedule/vex', method: 'POST', request: eventCreatePrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'programs' }, { call: 'teachers' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'create',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        {
          call: 'create',
          onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'sessions-changed' } }, { pop: true }],
          onError: [{ set: 'saving', value: false }],
        },
      ],
    },
  ],
};

export const eventFormInputSchema = z.toJSONSchema(z.object({}));
