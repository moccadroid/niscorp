import type { LayoutNode } from '@niscorp/nova';

// THE MEMBER'S SIDE.
//
// Bigger type, fewer columns, one action per row. These screens are read on a
// phone in a changing room, not at a desk — so nothing here is a table with
// six columns, and the primary action on every row is a single tap.

const page = (children: LayoutNode | LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 22 },
  children,
});

// The card. One row, joined from the membership, the studio and the plan the
// subscription points at — filtered to the caller by the member rung's reach,
// so there is no id on it and no way to ask for anybody else's.
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
          { component: 'Text', props: { size: 'lg', weight: 'semi' }, children: '$.card.plan_name' },
          { component: 'Badge', props: { tone: '$.card.status_tone', label: '$.card.status_label' } },
        ],
      },
      {
        component: 'Row',
        props: { gap: 22, wrap: true },
        children: [
          { component: 'Stat', props: { label: 'Included', value: '$.card.allowance_display' } },
          { component: 'Stat', props: { label: 'Member since', value: '$.card.joined_display' } },
        ],
      },
    ],
  },
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
            { label: 'When', px: 120, cell: { kind: 'text', key: 'when_display', color: 'ink' } },
          ],
        },
      },
    },
  },
]);

// THE MEMBERSHIP, ON ITS OWN SCREEN.
//
// The card is on the landing surface too, which is enough for somebody whose
// only relationship with the studio is a membership. It is not enough for
// somebody who ALSO works here: staff land on their staff surface, so a teacher
// who trains here held a card they had no way to open. It is reachable from the
// menu now, by anybody who holds a membership.
//
// It is also where a payment history and a signed waiver go, which the area's
// own blurb has claimed since it was written.
export const meMembershipLayout: LayoutNode = page([
  { component: 'Hero', props: { title: 'My membership', lead: 'What you are on, and since when.' } },
  card,
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

// Booking. One list, one button per row, and the button is the whole
// interaction — there is no form, because the only thing a member chooses is
// which class, and they choose it by tapping it.
export const meClassesLayout: LayoutNode = page([
  { component: 'Hero', props: { title: 'Book a class', lead: 'Drop into anything on the timetable, or join a course and hold your place for the whole block.' } },

  { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
  { if: '$.notice', then: { component: 'Notice', props: { tone: 'good', message: '$.notice' } }, else: '' },

  // COURSES FIRST, because they are the bigger commitment and the thing a
  // studio most wants filled — and because a member who joins one never has to
  // book its classes individually.
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
            // Hidden when the block is full rather than shown and refused —
            // the database would say no, and offering it anyway is a promise
            // the screen cannot keep.
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
          // Hidden on a CANCELLED class rather than shown and refused: the
          // studio called that one off, and offering it would be a lie the
          // database would then have to correct.
          //
          // A FULL class still offers the button, and that is what waitlists
          // change. Turning somebody away loses the one fact a studio most
          // wants — that demand exceeds the room — and leaves the member
          // checking back by hand. The seat count next to it already says
          // "24 of 24", and what they get is a place in the queue.
          { label: '', px: 96, align: 'right', cell: { kind: 'action', label: 'Book', ref: 'book', variant: 'outline', hideKey: 'cancelled' } },
        ],
      },
    },
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
          { label: 'When', px: 120, cell: { kind: 'text', key: 'when_display', color: 'ink' } },
          // Booked or waiting. The one status a member has to understand
          // without being told what the app means by it, so it is said in
          // words rather than left as a raw column value.
          { label: '', px: 92, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
          { label: '', px: 96, align: 'right', cell: { kind: 'action', label: 'Cancel', ref: 'cancel', variant: 'ghost' } },
        ],
      },
    },
  },
]);
