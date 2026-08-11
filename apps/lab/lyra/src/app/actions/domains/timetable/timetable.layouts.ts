import type { LayoutNode } from '@niscorp/nova';

const page = (children: LayoutNode | LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 22 },
  children,
});

// THE GRID — the rules, not the dated classes.
//
// A manager edits this and the timetable follows: adding a Tuesday slot puts
// Tuesdays on the calendar, moving it to Wednesday moves the ones nobody has
// booked. That derivation is a database trigger (schema.ts), so this screen
// only ever writes one row and never has to think about occurrences.
export const timetableListLayout: LayoutNode = page([
  {
    component: 'Row',
    props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
    children: [
      // Titled for the nav item that reaches it.
      //
      // This screen and the calendar were BOTH called "Timetable", and the
      // read-only one owned the nav item with that name — so the obvious place
      // to go and change the timetable was the one screen that cannot, and the
      // editable grid sat behind a nav item called "Classes" wearing the other
      // one's title. Two screens, one name, and the wrong one on the door.
      // ONE SCREEN FOR EVERYTHING THAT RUNS.
      //
      // "Weekly plan" and "Courses" were two screens over the same table with
      // different filters, which is what made them read as unrelated ideas and
      // produced the fair question "what ARE courses and programs?".
      //
      // They are one list. A row either repeats forever or runs between two
      // dates for a price — the Runs column says which, and that is the entire
      // difference between them.
      { component: 'Hero', props: { title: 'Classes', lead: 'Everything this studio runs. A class repeats every week; a course runs between two dates for a price. The calendar is generated from both.' } },
      // THREE WAYS TO ADD, AND THEY WRAP. Unwrapped they ran 376px wide on a
      // 327px column: "Add a one-off" hung off the right edge and the whole
      // page grew a sideways scrollbar. Every row of controls that can hold
      // three needs this — the parent's `between` wraps now, but a nested row
      // is its own line and has to say so itself.
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
        // GROUPED BY WHAT IT RUNS AS — which is what deleted the widest
        // column. "Every week" appeared in eight of nine rows: a value that
        // repeats in nine rows out of ten is not a column, it is a heading.
        // The dated blocks gather under their own.
        groupKey: 'runs_display',
        // TEN COLUMNS TO SIX, and the horizontal scrollbar with them. The old
        // spec computed to 1208px against a 1280 viewport with the rail open,
        // and a phone silently hid FOUR of its columns — teacher, seats, on
        // it, state — because everything past the third display column is
        // `display: none` below the breakpoint. A column that vanishes is not
        // a narrow column, it is an absent feature.
        //
        // What went, and why:
        //   Runs   → the group heading above.
        //   On it  → blank in eight of nine rows; it is a cohort count, and a
        //            cohort has a roster screen that says it properly.
        //   Who / Retire / Restore → one overflow. Three of ten columns were
        //            buttons, and on a phone the row became a button bar with
        //            the name squeezed between them.
        columns: [
          { label: 'Class', w: 2, sortable: 'name', cell: { kind: 'primary', key: 'name', subKey: 'program_name', dotKey: 'program_tone' } },
          { label: 'When', px: 116, cell: { kind: 'primary', key: 'weekday_display', subKey: 'starts_at' } },
          // A FACE, NOT A STRING. Eight rows of grey names read as texture;
          // an avatar makes "who teaches Monday" something you see.
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
    // EVERY SHEET FORM OPENS THE SAME WAY: one line saying what this makes,
    // then the fields, then one button. Three forms that each looked different
    // was three people's guesses at the same problem, and two of them were
    // titled twice because they still carried a page's Hero.
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
