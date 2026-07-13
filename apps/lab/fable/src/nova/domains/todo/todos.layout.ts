import type { LayoutNode } from '@niscorp/nova';

// A stat tile: the count over a small caption. The value is a binding into
// `$.stats`; `color` may be a bind-time conditional (the overdue tile turns
// red only when there is something overdue).
const stat = (value: string, label: string, color?: unknown): LayoutNode => ({
  component: 'Box',
  props: { class: 'fb-stat' },
  children: [
    { component: 'Text', props: { size: '2xl', weight: 620, ...(color !== undefined ? { color } : {}) }, children: value },
    { component: 'Text', props: { size: 'xs', color: 'mute', upper: true }, children: label },
  ],
});

// The todos surface: a stat row over one list card (toolbar + Table). The
// toolbar tabs switch `$.scope`; the search re-runs the same read in place.
// Cells show Vex/Prism-shaped fields verbatim. Literal + serializable.
export const todosLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 0 },
  children: [
    {
      component: 'Row',
      props: { gap: 12, align: 'stretch' },
      children: [
        stat('{{$.stats.open}}', 'Open'),
        stat('{{$.stats.due_today}}', 'Due today'),
        stat('{{$.stats.overdue}}', 'Overdue', { $if: '$.stats.overdue', $then: 'red', $else: 'default' }),
        stat('{{$.stats.done}}', 'Done'),
      ],
    },
    {
      component: 'Box',
      props: { class: 'fb-listcard' },
      children: [
        {
          component: 'Box',
          props: { px: 14, py: 12, border: 'bottom' },
          children: {
            component: 'Row',
            props: { justify: 'between', align: 'center', gap: 12, wrap: true },
            children: [
              {
                component: 'Row',
                props: { gap: 12, align: 'center' },
                children: [
                  { component: 'Text', props: { weight: 600 }, children: 'Todos' },
                  {
                    component: 'Tabs',
                    ref: 'tab',
                    props: {
                      value: '$.scope',
                      options: [
                        { value: 'open', label: 'Open' },
                        { value: 'today', label: 'Today' },
                        { value: 'done', label: 'Done' },
                      ],
                    },
                  },
                ],
              },
              {
                component: 'Row',
                props: { gap: 12, align: 'center' },
                children: [
                  {
                    component: 'Box',
                    props: { width: 210 },
                    children: { component: 'Input', ref: 'search', model: '$.search', props: { icon: 'search', placeholder: 'Search todos…', debounce: 200 } },
                  },
                  { if: '$.loading', then: '', else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.rows.length}} todos' } },
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
            cols: 'fb-cols-todos',
            rowKey: 'todo_id',
            empty: 'Nothing here — add a todo.',
            menu: {
              openId: '$.menuOpenId',
              openRef: 'menu-open',
              closeRef: 'menu-close',
              items: [
                { ref: 'row-edit', icon: 'edit', label: 'Edit todo' },
                { ref: 'row-delete', icon: 'trash', label: 'Delete', danger: true },
              ],
            },
            columns: [
              { label: '', cell: { kind: 'check', key: 'done', ref: 'toggle' } },
              { label: 'Todo', cell: { kind: 'primary', key: 'title', sub: '{notes}' } },
              { label: 'Priority', cell: { kind: 'badge', key: 'priority', toneMap: { low: 'slate', medium: 'blue', high: 'red' } } },
              { label: 'Due', cell: { kind: 'text', key: 'due_date_display', color: 'secondary', redIf: 'overdue' } },
            ],
          },
        },
      ],
    },
  ],
};
