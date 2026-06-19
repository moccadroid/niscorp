import type { LayoutNode } from '@niscorp/nova';

// My tasks, over `tasks.mine` (scoped by the toolbar tab). The toolbar (title +
// Open/Overdue/Done/All tabs + search + count) stays as Nova layout; the body is
// the reusable `Table` primitive. A leading `check` column completes/reopens a
// task inline; the ⋯ menu edits or deletes it. Cells show Vex/Prism-shaped
// fields verbatim. Literal + serializable.
export const tasksLayout: LayoutNode = {
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
              { component: 'Text', props: { weight: 600 }, children: 'My tasks' },
              {
                component: 'Tabs',
                ref: 'tab',
                props: {
                  value: '$.scope',
                  options: [
                    { value: 'open', label: 'Open' },
                    { value: 'overdue', label: 'Overdue' },
                    { value: 'done', label: 'Done' },
                    { value: 'all', label: 'All' },
                  ],
                },
              },
            ],
          },
          {
            component: 'Row',
            props: { gap: 12, align: 'center' },
            children: [
              { component: 'Box', props: { width: 210 }, children: { component: 'Input', ref: 'q', model: '$.q', props: { icon: 'search', placeholder: 'Search tasks…', debounce: 200 } } },
              { if: '$.loading', then: '', else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.rows.length}} tasks' } },
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
        cols: 'rl-cols-tasks',
        rowKey: 'task_id',
        sortBy: '$.sortBy',
        sortDir: '$.sortDir',
        sortRef: 'sort',
        empty: 'No tasks here.',
        menu: {
          openId: '$.menuOpenId',
          openRef: 'menu-open',
          closeRef: 'menu-close',
          items: [
            { ref: 'row-edit', icon: 'edit', label: 'Edit task' },
            { ref: 'row-delete', icon: 'trash', label: 'Delete', danger: true },
          ],
        },
        columns: [
          { label: '', cell: { kind: 'check', key: 'done', ref: 'toggle' } },
          { label: 'Task', sort: 'tasks.title', cell: { kind: 'primary', key: 'title' } },
          { label: 'Due', sort: 'tasks.due_date', cell: { kind: 'text', key: 'due_date_display', color: 'secondary' } },
          { label: 'Created', sort: 'tasks.created_at', cell: { kind: 'text', key: 'created_at', color: 'secondary' } },
        ],
      },
    },
  ],
};
