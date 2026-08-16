import type { LayoutNode } from '@niscorp/nova';

const page = (children: LayoutNode | LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 22 },
  children,
});

export const plansLayout: LayoutNode = page([
  {
    component: 'Row',
    props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
    children: [
      { component: 'Hero', props: { title: 'Offers', lead: 'Everything a member can pay for. Retiring one keeps everybody already on it.' } },
      // NAMED, not 'Add'. One unlabelled word at the top of a table already full
      // of rows is the easiest control in this application to slide past — and
      // it is the first thing a new studio has to find.
      { component: 'Button', props: { variant: 'solid', label: 'Add something to sell' }, ref: 'add' },
    ],
  },

  { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

  {
    component: 'Card',
    props: { flush: true },
    children: {
      component: 'Rows',
      props: {
        rows: '$.plans',
        loading: '$.loading',
        rowKey: 'offering_id',
        onRowRef: 'edit',
        empty: 'Nothing on sale yet. Add a plan or a pass and it becomes sellable immediately.',
        // A sortable header names the COLUMN, not the row key — the value is
        // sent as `sortBy` and resolved against the entry's own schema.
        sortKey: '$.sortBy',
        sortDir: '$.sortDir',
        onSortRef: 'sort',
        columns: [
          { label: 'On sale', w: 2, sortable: 'offerings.name', cell: { kind: 'primary', key: 'name', subKey: 'allowance_display' } },
          { label: 'Price', px: 120, align: 'right', sortable: 'offerings.price_cents', cell: { kind: 'text', key: 'price_display', color: 'ink' } },
          { label: 'Billed', px: 96, sortable: 'offerings.interval', cell: { kind: 'text', key: 'interval_display' } },
          { label: 'Terms', px: 150, cell: { kind: 'text', key: 'term_display', color: 'mute' } },
          { label: '', px: 104, align: 'right', cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
        ],
      },
    },
  },

  // ── COURSE BLOCKS, WHICH ARE ALSO SOLD ─────────────────────
  //
  // A course carries its own price and is absolutely a thing a member pays for —
  // but it is a dated block with a capacity and a timetable, not a price-list
  // row, so it keeps its own table and is edited under Schedule. That split
  // follows the model and the model is right.
  //
  // What was wrong is that NEITHER SCREEN MENTIONED THE OTHER. You had to
  // already know why a course is different in order to guess which hub to open.
  // So they are listed here, read-only, with the way to edit one said out loud:
  // one list answers "what can somebody pay for", and nothing had to move.
  {
    component: 'Section',
    props: {
      title: 'Course blocks',
      subtitle: 'Bounded blocks with their own price. Edited under Schedule → Classes, because they carry a timetable.',
    },
    children: {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.courses',
          rowKey: 'course_id',
          empty: 'No course blocks. Add one under Schedule → Classes.',
          columns: [
            { label: 'Block', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'dates_display' } },
            { label: 'Price', px: 120, align: 'right', cell: { kind: 'text', key: 'price_display', color: 'ink' } },
            { label: 'Places', px: 110, cell: { kind: 'text', key: 'places_display', color: 'mute' } },
          ],
        },
      },
    },
  },

]);
