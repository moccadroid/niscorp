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
      { component: 'Hero', props: { title: 'Pricing', lead: 'Everything this studio sells — plans and passes. Retiring one keeps everybody already on it.' } },
      { component: 'Button', props: { variant: 'solid', label: 'Add' }, ref: 'add' },
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

]);
