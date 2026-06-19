import type { LayoutNode } from '@niscorp/nova';

// Companies list — search toolbar (Nova) over the reusable `Table` primitive.
export const companiesLayout: LayoutNode = {
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
          { component: 'Text', props: { weight: 600 }, children: 'Companies' },
          {
            component: 'Row',
            props: { gap: 12, align: 'center' },
            children: [
              { component: 'Box', props: { width: 210 }, children: { component: 'Input', ref: 'q', model: '$.q', props: { icon: 'search', placeholder: 'Search companies…', debounce: 200 } } },
              { if: '$.loading', then: '', else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.rows.length}} accounts' } },
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
        cols: 'rl-cols-companies',
        rowRef: 'row',
        rowKey: 'company_id',
        selectedId: '$.highlight_id',
        sortBy: '$.sortBy',
        sortDir: '$.sortDir',
        sortRef: 'sort',
        empty: 'No companies match your search.',
        menu: {
          openId: '$.menuOpenId',
          openRef: 'menu-open',
          closeRef: 'menu-close',
          items: [
            { ref: 'row-open', icon: 'arrow-right', label: 'Open' },
            { ref: 'row-edit', icon: 'edit', label: 'Edit company' },
            { ref: 'row-delete', icon: 'trash', label: 'Delete', danger: true },
          ],
        },
        columns: [
          { label: 'Company', sort: 'companies.name', cell: { kind: 'avatarName', key: 'name' } },
          { label: 'Industry', sort: 'companies.industry', cell: { kind: 'badge', key: 'industry' } },
          { label: 'Size', sort: 'companies.size', cell: { kind: 'text', key: 'size', color: 'dim' } },
          { label: 'Domain', sort: 'companies.domain', cell: { kind: 'text', key: 'domain', mono: true, size: 'sm', color: 'dim' } },
        ],
      },
    },
  ],
};
