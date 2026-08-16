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

  // ── COURSE BLOCKS, AUTHORED HERE LIKE EVERYTHING ELSE ──────
  //
  // A block's PRICE is a catalogue row now, the same as a plan's or a pass's —
  // see courses.offering_id. What stays its own table is what makes a block a
  // block: dates, a capacity, a roster, a timetable.
  //
  // Which is why it keeps its own section rather than joining the list above.
  // The columns are different because the thing is different, and a block
  // squeezed into "Price / Billed / Terms" would be three empty cells and a
  // date hidden in a subtitle. Two sections, one screen, one place to author
  // anything a member can pay for.
  //
  // Both controls used to be somewhere else, and the edit one existed nowhere
  // at all: a block could be created and its roster read, and never changed.
  {
    component: 'Section',
    props: {
      title: 'Course blocks',
      subtitle: 'Bounded blocks with dates and a roster. Priced here; the timetable they generate is under Schedule.',
    },
    children: [
      {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.courses',
            rowKey: 'course_id',
            onRowRef: 'editCourse',
            empty: 'No course blocks yet. A block is a run of classes somebody joins once and holds a seat in.',
            columns: [
              { label: 'Block', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'dates_display' } },
              { label: 'Price', px: 120, align: 'right', cell: { kind: 'text', key: 'price_display', color: 'ink' } },
              { label: 'Places', px: 110, cell: { kind: 'text', key: 'places_display', color: 'mute' } },
            ],
          },
        },
      },
      { component: 'Button', props: { variant: 'ghost', label: 'Add a course block' }, ref: 'addCourse' },
    ],
  },

]);
