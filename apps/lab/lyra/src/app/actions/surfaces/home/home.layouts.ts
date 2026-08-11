import type { LayoutNode } from '@niscorp/nova';

// Three landing surfaces, one per audience — and they are separate LAYOUTS
// because they are separate ACTIONS (ring 1), not one screen hiding cards.
//
// The distinction is the whole point of the charter. A hidden card is still
// served: the figure crossed the wire, the read ran, and only a layout decided
// not to draw it. An action a principal does not hold never mounts, its
// endpoints never fire, and the query is refused at the engine even if somebody
// asks for it by hand.
//
// So an instructor does not see a revenue card that is switched off. There is
// no revenue card in their application.

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
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Members', value: '{{$.memberCount}}', hint: 'active and trialling' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Checked in today', value: '{{$.checkedInToday}}' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Classes today', value: '{{$.sessionsToday.length}}' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Expected monthly', value: '$.revenue', hint: 'from active plans' } } },
    ],
  },
  todaysClasses,
]);

// ── the front desk's view ────────────────────────────────────
// Who is on the books and who has walked in. No revenue: the desk runs the
// day, and what the studio earns is not theirs to see.
export const deskLayout: LayoutNode = page([
  hero,
  {
    component: 'Grid',
    props: { min: 190, gap: 14 },
    children: [
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Members', value: '{{$.memberCount}}', hint: 'active and trialling' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Checked in today', value: '{{$.checkedInToday}}' } } },
      { component: 'Card', props: {}, children: { component: 'Stat', props: { label: 'Classes today', value: '{{$.sessionsToday.length}}' } } },
    ],
  },
  todaysClasses,
]);

// ── the instructor's and member's view ───────────────────────
// The day, and nothing about the business. No headcount, no takings — an
// instructor teaches and a member trains, and neither question is theirs.
export const classesLayout: LayoutNode = page([hero, todaysClasses]);
