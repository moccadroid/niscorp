import type { LayoutNode } from '@niscorp/nova';

const page = (children: LayoutNode | LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 26 },
  children,
});

// The day's timetable, shared by all three. Same rows, same spec — what differs
// between audiences is what sits ABOVE it.
const todaysClasses: LayoutNode = {
  component: 'Section',
  props: { title: "Today's classes" },
  children: {
    component: 'Card',
    props: { flush: true },
    children: {
      component: 'Rows',
      props: {
        rows: '$.sessionsToday',
        loading: '$.loading',
        rowKey: 'session_id',
        empty: 'Nothing scheduled today.',
        emptyHint: 'Quiet day. The timetable is where classes get added.',
        columns: [
          { label: 'Class', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'program_name', dotKey: 'program_tone' } },
          { label: 'Starts', px: 84, cell: { kind: 'text', key: 'time_display', color: 'soft' } },
          { label: 'Booked', px: 92, align: 'right', cell: { kind: 'badge', key: 'booked_display', toneKey: 'fill_tone' } },
        ],
      },
    },
  },
};

const hero: LayoutNode = { component: 'Hero', props: { eyebrow: '$.studioName', title: '$.greeting' } };

// ── the owner's and manager's view ───────────────────────────
// The only one with money on it.
export const overviewLayout: LayoutNode = page([
  hero,
  {
    component: 'Grid',
    props: { min: 190, gap: 14 },
    children: [
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Members', value: '{{$.memberCount}}', hint: 'on the books' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Checked in today', value: '{{$.checkedInToday}}' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Classes today', value: '{{$.sessionsToday.length}}' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Expected monthly', value: '$.revenue', hint: 'from active plans' } } },
    ],
  },
  todaysClasses,
]);

// ── the front desk's view ────────────────────────────────────
export const deskLayout: LayoutNode = page([
  hero,
  {
    component: 'Grid',
    props: { min: 190, gap: 14 },
    children: [
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Members', value: '{{$.memberCount}}', hint: 'on the books' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Checked in today', value: '{{$.checkedInToday}}' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Classes today', value: '{{$.sessionsToday.length}}' } } },
    ],
  },
  todaysClasses,
]);

// ── the instructor's and member's view ───────────────────────
export const classesLayout: LayoutNode = page([hero, todaysClasses]);
