import type { LayoutNode } from '@niscorp/nova';

const page = (children: LayoutNode | LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 22 },
  children,
});

// The grid — the RULES, not the dated classes. A manager edits one row and the
// calendar follows, because the derivation is a database trigger (schema.ts).
export const timetableListLayout: LayoutNode = page([
  {
    component: 'Row',
    props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
    children: [
      { component: 'Hero', props: { title: 'Classes', lead: 'Everything this studio runs. A class repeats every week; a course runs between two dates for a price. The calendar is generated from both.' } },
      {
        component: 'Row',
        props: { gap: 8, wrap: true },
        children: [
          { component: 'Button', props: { variant: 'solid', label: 'Add a class' }, ref: 'add' },
          { component: 'Button', props: { variant: 'outline', label: 'Add a course' }, ref: 'addCourse' },
          { component: 'Button', props: { variant: 'ghost', label: 'Add a one-off' }, ref: 'addEvent' },
        ],
      },
    ],
  },

  { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

  {
    component: 'Card',
    props: { flush: true },
    children: {
      component: 'Rows',
      props: {
        rows: '$.templates',
        loading: '$.loading',
        rowKey: 'template_id',
        onRowRef: 'edit',
        empty: 'No classes yet.',
        emptyHint: 'Add the first weekly slot and the calendar fills itself.',
        // Grouped by what it runs as, which is what deletes the widest column:
        // a value repeating in nine rows out of ten is a heading, not a column.
        groupKey: 'runs_display',
        columns: [
          // Deliberately NOT sortable, unlike Staff and Pricing: this list is
          // grouped by `runs_display`, and a caller-supplied ORDER BY replaces
          // the entry's whole sort — so the grouping would stop being
          // contiguous and the same heading would repeat down the page.
          // Grouping owns this list's order; the two cannot both have it.
          { label: 'Class', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'program_name', dotKey: 'program_tone' } },
          { label: 'When', px: 116, cell: { kind: 'primary', key: 'weekday_display', subKey: 'starts_at' } },
          // A face, not a string: eight rows of grey names read as texture.
          { label: 'Teacher', px: 148, cell: { kind: 'avatar', key: 'instructor_name' } },
          { label: 'Seats', px: 68, align: 'right', cell: { kind: 'number', key: 'capacity' } },
          { label: 'State', px: 88, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
          {
            label: '',
            px: 44,
            align: 'right',
            cell: {
              kind: 'menu',
              items: [
                // Only a course has people enrolled on it, so only a course
                // offers the roster — `showKey`, rather than a second screen.
                { label: 'Who is on it', ref: 'roster', icon: 'people', showKey: 'is_course' },
                { label: 'Retire', ref: 'retire', icon: 'pause', danger: true, showKey: 'active' },
                { label: 'Put back on', ref: 'restore', icon: 'undo', hideKey: 'active' },
              ],
            },
          },
        ],
      },
    },
  },
]);

export const timetableFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    // Every sheet form opens the same way: one line saying what this makes, then
    // the fields, then one button. No Hero — the sheet supplies the title.
    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'A weekly slot that repeats forever. The calendar fills itself in from it.' },
    { component: 'Input', props: { label: 'Class name', placeholder: 'Morning Flow' }, ref: 'name', model: '$.name' },
    {
      component: 'Select',
      props: { label: 'Class type', options: '$.programOptions', hint: 'What kind of class this is. The type carries the colour the timetable uses.' },
      ref: 'programId',
      model: '$.programId',
    },
    {
      component: 'Row',
      props: { gap: 12, wrap: true },
      children: [
        { component: 'Select', props: { label: 'Day', options: '$.weekdayOptions', numeric: true }, ref: 'weekday', model: '$.weekday' },
        { component: 'Input', props: { label: 'Starts at', type: 'time' }, ref: 'startsAt', model: '$.startsAt' },
      ],
    },
    {
      component: 'Row',
      props: { gap: 12, wrap: true },
      children: [
        { component: 'Input', props: { label: 'Minutes', type: 'number' }, ref: 'durationMins', model: '$.durationMins' },
        { component: 'Input', props: { label: 'Places', type: 'number' }, ref: 'capacity', model: '$.capacity' },
      ],
    },
    {
      component: 'Select',
      props: { label: 'Taught by', options: '$.teacherOptions', emptyLabel: 'Unassigned', hint: 'Leave unassigned if you have not decided — the class still runs.' },
      ref: 'instructorId',
      model: '$.instructorId',
    },
    {
      if: '$.templateId',
      then: { component: 'Button', props: { variant: 'solid', big: true, label: 'Save', disabled: '$.saving' }, ref: 'save' },
      else: { component: 'Button', props: { variant: 'solid', big: true, label: 'Add class', disabled: '$.saving' }, ref: 'create' },
    },
  ],
};

// ── programs ─────────────────────────────────────────────────

export const programsLayout: LayoutNode = page([
  {
    component: 'Row',
    props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
    children: [
      { component: 'Hero', props: { title: 'Class types', lead: 'The kinds of class this studio teaches — Vinyasa, Fundamentals, Competition. Each carries a colour the timetable uses.' } },
      { component: 'Button', props: { variant: 'solid', label: 'Add a class type' }, ref: 'add' },
    ],
  },

  { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

  {
    component: 'Card',
    props: { flush: true },
    children: {
      component: 'Rows',
      props: {
        rows: '$.programs',
        loading: '$.loading',
        rowKey: 'program_id',
        onRowRef: 'edit',
        empty: 'No programs yet.',
        columns: [
          { label: 'Program', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'blurb', dotKey: 'tone' } },
        ],
      },
    },
  },

]);

// A ONE-OFF. The same fields as a weekly slot minus the weekday, plus a date —
// which is exactly what the difference between the two is.
export const eventFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'A workshop, a masterclass, a Saturday intensive — one date, and no weekly rule behind it.' },
    { component: 'Input', props: { label: 'Name', placeholder: 'Inversions masterclass' }, ref: 'name', model: '$.name' },
    {
      component: 'Select',
      props: { label: 'Class type', options: '$.programOptions', hint: 'What kind of class this is. The type carries the colour the timetable uses.' },
      ref: 'programId',
      model: '$.programId',
    },
    {
      component: 'Row',
      props: { gap: 12, wrap: true },
      children: [
        { component: 'Input', props: { label: 'Date', type: 'date' }, ref: 'heldOn', model: '$.heldOn' },
        { component: 'Input', props: { label: 'Starts at', type: 'time' }, ref: 'startsAt', model: '$.startsAt' },
      ],
    },
    {
      component: 'Row',
      props: { gap: 12, wrap: true },
      children: [
        { component: 'Input', props: { label: 'Minutes', type: 'number' }, ref: 'durationMins', model: '$.durationMins' },
        { component: 'Input', props: { label: 'Places', type: 'number' }, ref: 'capacity', model: '$.capacity' },
      ],
    },
    {
      component: 'Select',
      props: { label: 'Taught by', options: '$.teacherOptions', emptyLabel: 'Unassigned' },
      ref: 'instructorId',
      model: '$.instructorId',
    },
    { component: 'Button', props: { variant: 'solid', big: true, label: 'Put it on', disabled: '$.saving' }, ref: 'create' },
  ],
};
