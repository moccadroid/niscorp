import type { LayoutNode } from '@niscorp/nova';

// The deals table view. The toolbar (title + All/Mine tabs + search + count)
// stays as Nova layout; the table body is the reusable `Table` primitive, driven
// by a `columns` data-spec. Cells show Vex/Prism-shaped fields verbatim. The row
// `⋯` menu, sort headers, skeleton and empty-state are all the Table's job — the
// action's triggers (row / sort / q / menu-*) are unchanged. One of the two
// layouts the `deals` action renders (see deals.layout.ts).
export const dealsTableLayout: LayoutNode = {
  component: 'Box',
  props: { bg: 'surface', border: true, radius: 13, class: 'rl-listcard' },
  children: [
    {
      component: 'Box',
      props: { px: 18, py: 12, border: 'bottom' },
      children: {
        component: 'Row',
        props: { justify: 'between', align: 'center', gap: 12, wrap: true },
        children: [
          {
            component: 'Row',
            props: { gap: 12, align: 'center' },
            children: [
              { component: 'Text', props: { weight: 600 }, children: 'Deals' },
              {
                component: 'Tabs',
                ref: 'tab',
                props: {
                  value: '$.ownerId',
                  options: [
                    { value: '', label: 'All' },
                    { value: 'me', label: 'My deals' },
                  ],
                },
              },
            ],
          },
          {
            component: 'Row',
            props: { gap: 12, align: 'center' },
            children: [
              { component: 'Box', props: { width: 210 }, children: { component: 'Input', ref: 'q', model: '$.q', props: { icon: 'search', placeholder: 'Search deals…', debounce: 200 } } },
              { if: '$.loading', then: '', else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.rows.length}} deals' } },
            ],
          },
        ],
      },
    },
    {
      component: 'Table',
      props: {
        rows: '$.rows',
        loading: '$.loading',
        cols: 'rl-cols-deals',
        rowRef: 'row',
        rowKey: 'deal_id',
        selectedId: '$.highlight_id',
        sortBy: '$.sortBy',
        sortDir: '$.sortDir',
        sortRef: 'sort',
        empty: 'No deals match your search.',
        menu: {
          openId: '$.menuOpenId',
          openRef: 'menu-open',
          closeRef: 'menu-close',
          items: [
            { ref: 'row-open', icon: 'arrow-right', label: 'Open' },
            { ref: 'row-edit', icon: 'edit', label: 'Edit deal' },
            { ref: 'row-delete', icon: 'trash', label: 'Delete', danger: true },
          ],
        },
        columns: [
          { label: 'Deal', sort: 'deals.title', cell: { kind: 'primary', key: 'title', icon: 'target', sub: '{owner} · closes {close_date_display}' } },
          { label: 'Company', sort: 'companies.name', cell: { kind: 'text', key: 'company', color: 'secondary' } },
          { label: 'Stage', sort: 'stages.name', cell: { kind: 'badge', key: 'stage', tone: 'blue' } },
          { label: 'Value', sort: 'deals.value', cell: { kind: 'text', key: 'value_display', mono: true, weight: 540 } },
          { label: 'Status', sort: 'deals.status', cell: { kind: 'badge', key: 'status', toneMap: { won: 'green', lost: 'red', _: 'blue' }, dot: true } },
          { label: 'Created', sort: 'deals.created_at', cell: { kind: 'text', key: 'created_at', color: 'secondary' } },
        ],
      },
    },
  ],
};
