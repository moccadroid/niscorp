import type { LayoutNode } from '@niscorp/nova';

const page = (children: LayoutNode | LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 22 },
  children,
});

// THE PRICE LIST.
//
// The one screen in this application where nothing is deleted. A plan with
// subscribers is a promise somebody is still paying against, so the only way
// off the list is `active = false` — which stops it being offered and leaves
// everybody on it exactly where they were. That is why the row action reads
// "Retire" and why retired plans stay visible, greyed rather than gone.
export const plansLayout: LayoutNode = page([
  {
    component: 'Row',
    props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
    children: [
      { component: 'Hero', props: { title: 'Plans', lead: 'What this studio sells. Retiring a plan keeps everybody already on it.' } },
      { component: 'Button', props: { variant: 'solid', label: 'Add a plan' }, ref: 'add' },
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
        rowKey: 'plan_id',
        onRowRef: 'edit',
        empty: 'No plans yet. Add one and it becomes sellable immediately.',
        columns: [
          { label: 'Plan', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'allowance_display' } },
          { label: 'Price', px: 120, align: 'right', cell: { kind: 'text', key: 'price_display', color: 'ink' } },
          { label: 'Billed', px: 96, cell: { kind: 'text', key: 'interval_display' } },
          { label: '', px: 104, align: 'right', cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
        ],
      },
    },
  },

]);
