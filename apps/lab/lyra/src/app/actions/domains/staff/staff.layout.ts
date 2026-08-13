import type { LayoutNode } from '@niscorp/nova';

export const staffLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
      children: [
        {
          component: 'Hero',
          props: {
            title: 'Staff',
            lead: 'Who works here, and what they can do. Changing a role changes their whole application — no sign-out needed.',
          },
        },
        { component: 'Button', props: { variant: 'solid', label: 'Add somebody' }, ref: 'add' },
      ],
    },

    { component: 'Input', props: { placeholder: 'Search by name or email' }, ref: 'search', model: '$.search' },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    { if: '$.notice', then: { component: 'Notice', props: { tone: 'good', message: '$.notice' } }, else: '' },

    {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.staff',
          loading: '$.loading',
          rowKey: 'staff_id',
          empty: 'Nobody on staff yet.',
          // A sortable header names the COLUMN, not the row key: the value goes
          // to vex as `sortBy` and is resolved against the entry's schema.
          sortKey: '$.sortBy',
          sortDir: '$.sortDir',
          onSortRef: 'sort',
          columns: [
            { label: 'Person', w: 2, sortable: 'people.name', cell: { kind: 'avatar', key: 'person_name', subKey: 'email' } },
            { label: 'Role', px: 104, sortable: 'staff.role', cell: { kind: 'badge', key: 'role_display', hueKey: 'role_hue' } },
            { label: 'State', px: 96, sortable: 'staff.active', cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
            {
              label: '',
              px: 44,
              align: 'right',
              cell: {
                kind: 'menu',
                items: [
                  { label: 'Remove from staff', ref: 'deactivate', icon: 'signout', danger: true, showKey: 'active' },
                  { label: 'Put back on staff', ref: 'reactivate', icon: 'undo', hideKey: 'active' },
                ],
              },
            },
          ],
        },
      },
    },

    {
      component: 'Section',
      props: { title: 'Change a role', subtitle: 'The four roles the charter defines. Nothing here can invent a fifth.' },
      children: {
        component: 'Stack',
        props: { gap: 8 },
        children: {
          for: '$.staff',
          as: 'person',
          key: 'staff_id',
          do: {
            component: 'Card',
            props: { pad: 12 },
            children: {
              component: 'Stack',
              props: { gap: 10 },
              children: [
            {
              component: 'Row',
              props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
              children: [
                {
                  component: 'Row',
                  props: { gap: 10, align: 'center' },
                  children: [
                    { component: 'Avatar', props: { name: '$.person.person_name', size: 28 } },
                    { component: 'Text', props: { size: 'sm', weight: 'medium' }, children: '$.person.person_name' },
                    { component: 'Badge', props: { hue: '$.person.role_hue', label: '$.person.role_display' } },
                  ],
                },
                {
                  component: 'RolePicker',
                  props: { value: '$.person.role', options: '$.roleOptions', context: '$.person' },
                  ref: 'role',
                },
              ],
            },

              ],
            },
          },
        },
      },
    },
  ],
};
