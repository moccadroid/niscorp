import type { LayoutNode } from '@niscorp/nova';

const page = (children: LayoutNode | LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 22 },
  children,
});

const card: LayoutNode = {
  component: 'Card',
  props: { pad: 22 },
  children: {
    component: 'Stack',
    props: { gap: 14 },
    children: [
      {
        component: 'Row',
        props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
        children: [
          {
            component: 'Text',
            props: { size: 'lg', weight: 'semi' },
            children: { if: '$.membership.subscription_id', then: '$.membership.plan_name', else: '$.card.studio_name' },
          },
          { component: 'Badge', props: { tone: '$.card.status_tone', label: '$.card.status_label' } },
        ],
      },
      {
        component: 'Row',
        props: { gap: 22, wrap: true },
        children: [
          { component: 'Stat', props: { label: 'With us since', value: '$.card.joined_display' } },
          {
            if: '$.membership.subscription_id',
            then: { component: 'Stat', props: { label: 'Worth', value: '$.membership.value_display' } },
            else: '',
          },
        ],
      },
      {
        if: '$.card.on_trial',
        then: {
          component: 'Stack',
          props: { gap: 10 },
          children: [
            { component: 'Notice', props: { tone: 'calm', message: 'Your trial runs until {{$.card.trial_display}}.' } },
            { component: 'Button', props: { variant: 'solid', big: true, label: 'Choose a plan' }, ref: 'choosePlan' },
          ],
        },
        else: '',
      },
    ],
  },
};

const passes: LayoutNode = {
  if: '$.passes',
  then: {
    component: 'Card',
    props: { flush: true },
    children: {
      component: 'Rows',
      props: {
        rows: '$.passes',
        rowKey: 'pass_id',
        headers: false,
        columns: [
          { label: '', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'credits_display' } },
          { label: '', px: 92, align: 'right', cell: { kind: 'text', key: 'state_label', color: 'mute' } },
        ],
      },
    },
  },
  else: '',
};

export const homeMemberLayout: LayoutNode = page([
  { component: 'Hero', props: { eyebrow: '$.studioName', title: '$.greeting', lead: 'Your classes and your membership.' } },

  card,

  {
    component: 'Section',
    props: { title: 'Coming up', subtitle: 'What you have booked.' },
    children: {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.bookings',
          loading: '$.loading',
          rowKey: 'booking_id',
          empty: 'Nothing booked yet.',
          emptyHint: 'Pick something from Book a class.',
          columns: [
            { label: 'Class', w: 2, cell: { kind: 'primary', key: 'class_name', subKey: 'program_name', dotKey: 'tone' } },
            { label: 'When', px: 150, cell: { kind: 'text', key: 'when_display', color: 'ink' } },
          ],
        },
      },
    },
  },
]);

export const meMembershipLayout: LayoutNode = page([
  { component: 'Hero', props: { title: 'My membership', lead: 'What you hold, and since when.' } },
  { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
  { if: '$.notice', then: { component: 'Notice', props: { tone: 'good', message: '$.notice' } }, else: '' },
  card,

  {
    if: '$.membership.subscription_id',
    then: '',
    else: {
      component: 'Section',
      props: { title: 'Choose a plan', subtitle: 'Starts today. You will confirm the terms before anything is signed.' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.plans',
            rowKey: 'offering_id',
            empty: 'Nothing on sale just now.',
            emptyHint: 'Ask at the desk about joining.',
            columns: [
              { label: 'Plan', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'term_display' } },
              { label: 'Price', px: 110, align: 'right', cell: { kind: 'text', key: 'price_display', color: 'ink' } },
              { label: '', px: 96, align: 'right', cell: { kind: 'action', label: 'Choose', ref: 'pick', variant: 'solid' } },
            ],
          },
        },
      },
    },
  },
  {
    if: '$.membership.subscription_id',
    then: {
      component: 'Card',
      props: { pad: 22 },
      children: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          {
            component: 'Row',
            props: { gap: 22, wrap: true },
            children: [
              { component: 'Field', props: { label: 'Minimum term', phrase: '$.membership.term_display' } },
              { component: 'Field', props: { label: 'Notice', phrase: '$.membership.notice_display' } },
              { component: 'Field', props: { label: 'Committed until', value: '$.membership.committed_display', empty: 'No commitment' } },
              { component: 'Field', props: { label: 'Paid', phrase: '$.membership.paid_via_display' } },
              { component: 'Field', props: { label: 'Paid until', value: '$.membership.paid_until_display', empty: 'Nothing recorded yet' } },
            ],
          },
          {
            if: '$.membership.notice_given',
            then: {
              component: 'Row',
              props: { gap: 12, align: 'center', wrap: true },
              children: [
                { component: 'Badge', props: { label: 'Leaving', tone: 'warn' } },
                { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Your last day is {{$.membership.ends_display}} — the longer of your notice period and your minimum term. Changed your mind? Talk to the desk.' },
              ],
            },
            else: {
              component: 'Row',
              props: { gap: 10, wrap: true },
              children: [
                {
                  if: { $eq: ['$.membership.status', 'paused'] },
                  then: { component: 'Button', props: { variant: 'solid', label: 'Resume' }, ref: 'resume' },
                  else: { component: 'Button', props: { variant: 'outline', label: 'Pause' }, ref: 'pause' },
                },
                { component: 'Button', props: { variant: 'ghost', label: 'Give notice' }, ref: 'giveNotice' },
              ],
            },
          },
        ],
      },
    },
    else: '',
  },
  passes,
  {
    component: 'Card',
    props: { pad: 22 },
    children: {
      component: 'Stack',
      props: { gap: 6 },
      children: [
        { component: 'Text', props: { size: 'sm', muted: true }, children: 'Studio' },
        { component: 'Text', props: { size: 'md', weight: 'semi' }, children: '$.card.studio_name' },
      ],
    },
  },
]);

const classList = (book: { label: string; ref: string }): LayoutNode => ({
  component: 'Card',
  props: { flush: true },
  children: {
    component: 'Rows',
    props: {
      rows: '$.sessions',
      loading: '$.loading',
      rowKey: 'session_id',
      empty: 'No classes scheduled.',
      columns: [
        { label: 'Class', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'program_name', dotKey: 'program_tone' } },
        { label: 'When', px: 112, cell: { kind: 'text', key: 'day_display', color: 'ink' } },
        { label: 'Time', px: 78, cell: { kind: 'text', key: 'time_display' } },
        { label: 'Places', px: 84, align: 'right', cell: { kind: 'text', key: 'booked_display', color: 'ink' } },
        // The mark is what the caller holds: a child's bookings are not in
        // `me/booked-sessions`, so it is absent when booking for one. The
        // database refuses a duplicate either way.
        { label: '', px: 92, align: 'right', cell: { kind: 'badge', key: 'mine_display', toneKey: 'mine_tone', showKey: 'already_booked' } },
        { label: '', px: 96, align: 'right', cell: { kind: 'action', label: book.label, ref: book.ref, variant: 'outline', hideKey: 'unbookable' } },
      ],
    },
  },
});

export const meClassesLayout: LayoutNode = page([
  { component: 'Hero', props: { title: 'Book a class', lead: 'Drop into anything on the timetable, or join a course and hold your place for the whole block.' } },

  { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
  { if: '$.notice', then: { component: 'Notice', props: { tone: 'good', message: '$.notice' } }, else: '' },

  {
    component: 'Section',
    props: { title: 'Courses', subtitle: 'Join once and your place is held for every week of the block.' },
    children: {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.courses',
          loading: '$.loading',
          rowKey: 'course_id',
          empty: 'No courses running just now.',
          columns: [
            { label: 'Course', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'blurb', dotKey: 'tone' } },
            { label: 'Runs', px: 168, cell: { kind: 'text', key: 'dates_display', color: 'ink' } },
            { label: 'Places', px: 84, align: 'right', cell: { kind: 'text', key: 'places_display' } },
            { label: '', px: 84, align: 'right', cell: { kind: 'action', label: 'Join', ref: 'join', variant: 'outline', hideKey: 'full' } },
          ],
        },
      },
    },
  },

  {
    if: '$.enrolments',
    then: {
      component: 'Section',
      props: { title: 'Courses you are on' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.enrolments',
            rowKey: 'enrolment_id',
            empty: 'None yet.',
            columns: [
              { label: 'Course', w: 2, cell: { kind: 'primary', key: 'course_name', subKey: 'dates_display' } },
              { label: '', px: 96, align: 'right', cell: { kind: 'action', label: 'Leave', ref: 'leave', variant: 'ghost' } },
            ],
          },
        },
      },
    },
    else: '',
  },

  { component: 'Text', props: { size: 'lg', weight: 'semi' }, children: 'Single classes' },

  {
    if: '$.family',
    then: {
      component: 'Row',
      props: { gap: 12, align: 'center', wrap: true },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Booking for' },
        { component: 'Tabs', props: { value: '$.subjectId', options: '$.family' }, ref: 'subject' },
      ],
    },
    else: '',
  },

  {
    if: '$.subjectId',
    then: classList({ label: 'Book for them', ref: 'bookFor' }),
    else: classList({ label: 'Book', ref: 'book' }),
  },
]);

export const meBookingsLayout: LayoutNode = page([
  { component: 'Hero', props: { title: 'My classes', lead: 'Everything you are booked into.' } },

  { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
  { if: '$.notice', then: { component: 'Notice', props: { tone: 'good', message: '$.notice' } }, else: '' },

  {
    component: 'Card',
    props: { flush: true },
    children: {
      component: 'Rows',
      props: {
        rows: '$.bookings',
        loading: '$.loading',
        rowKey: 'booking_id',
        empty: 'Nothing booked yet.',
        emptyHint: 'Anything you book will show up here.',
        columns: [
          { label: 'Class', w: 2, cell: { kind: 'primary', key: 'class_name', subKey: 'program_name', dotKey: 'tone' } },
          { label: 'When', px: 150, cell: { kind: 'text', key: 'when_display', color: 'ink' } },
          { label: '', px: 92, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
          { label: '', px: 96, align: 'right', cell: { kind: 'action', label: 'Cancel', ref: 'cancel', variant: 'ghost', hideKey: 'session_cancelled' } },
        ],
      },
    },
  },

  {
    if: '$.family',
    then: {
      component: 'Section',
      props: { title: 'My family', subtitle: 'Everything your children are booked into.' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.familyBookings',
            rowKey: 'booking_id',
            empty: 'Nothing booked yet.',
            emptyHint: 'Anything you book for them will show up here.',
            columns: [
              { label: 'Class', w: 2, cell: { kind: 'primary', key: 'class_name', subKey: 'program_name', dotKey: 'tone' } },
              { label: 'When', px: 150, cell: { kind: 'text', key: 'when_display', color: 'ink' } },
              { label: '', px: 92, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
              { label: '', px: 96, align: 'right', cell: { kind: 'action', label: 'Cancel', ref: 'cancelFor', variant: 'ghost', hideKey: 'session_cancelled' } },
            ],
          },
        },
      },
    },
    else: '',
  },
]);
