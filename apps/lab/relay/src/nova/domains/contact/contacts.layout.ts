import type { LayoutNode } from '@niscorp/nova';

// Contacts list — a search toolbar (Nova) over the reusable `Table` primitive.
// The company is nested on each row (`company.name`), reached by the cell's
// dotted key. Sort headers, the row `⋯` menu, skeleton + empty are the Table's.
export const contactsLayout: LayoutNode = {
  component: 'Box',
  props: {},
  children: [
    {
      component: 'Box',
      props: { px: 14, py: 12, border: 'bottom' },
      children: {
        component: 'Row',
        props: { justify: 'between', align: 'center', gap: 12, wrap: true },
        children: [
          { component: 'Text', props: { weight: 600 }, children: 'Contacts' },
          {
            component: 'Row',
            props: { gap: 12, align: 'center' },
            children: [
              { component: 'Box', props: { width: 210 }, children: { component: 'Input', ref: 'search', model: '$.search', props: { icon: 'search', placeholder: 'Search contacts…', debounce: 200 } } },
              { if: '$.loading', then: '', else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.rows.length}} people' } },
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
        rowRef: 'row',
        rowKey: 'contact_id',
        selectedId: '$.highlight_id',
        sortBy: '$.sortBy',
        sortDir: '$.sortDir',
        sortRef: 'sort',
        empty: 'No contacts match your search.',
        menu: {
          openId: '$.menuOpenId',
          openRef: 'menu-open',
          closeRef: 'menu-close',
          items: [
            { ref: 'row-open', icon: 'arrow-right', label: 'Open' },
            { ref: 'row-edit', icon: 'edit', label: 'Edit contact' },
            { ref: 'row-delete', icon: 'trash', label: 'Delete', danger: true },
          ],
        },
        columns: [
          { label: 'Name', sort: 'contacts.last_name', w: 1.4, cell: { kind: 'avatarName', key: 'name' } },
          { label: 'Title', sort: 'contacts.title', w: 1, hideNarrow: true, cell: { kind: 'text', key: 'title', color: 'secondary' } },
          { label: 'Company', sort: 'companies.name', w: 1.2, cell: { kind: 'badge', key: 'company.name' } },
          { label: 'Email', sort: 'contacts.email', w: 1.4, hideNarrow: true, cell: { kind: 'text', key: 'email', mono: true, size: 'sm', color: 'dim' } },
        ],
      },
    },
  ],
};
