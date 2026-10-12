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
        sortKey: '$.sortBy',
        sortDir: '$.sortDir',
        onSortRef: 'sort',
        columns: [
          { label: 'On sale', w: 2, sortable: 'offerings.name', cell: { kind: 'primary', key: 'name', subKey: 'allowance_display' } },
          { label: 'Price', px: 120, align: 'right', sortable: 'offerings.price_cents', cell: { kind: 'text', key: 'price_display', color: 'ink' } },
          { label: 'Billed', px: 96, sortable: 'offerings.interval', cell: { kind: 'text', key: 'interval_display' } },
          { label: 'Terms', px: 150, cell: { kind: 'text', key: 'term_display', color: 'mute' } },
          // Sized for the German badge: 'Zurückgezogen' is half again as long as
          // 'Retired', and a column sized to the English clips it.
          { label: '', px: 132, align: 'right', cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
        ],
      },
    },
  },

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
