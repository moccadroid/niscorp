import type { LayoutNode } from '@niscorp/nova';

// The ACL screen, and it is deliberately plain. A role is one tap; the
// consequence is the whole application changing for that person, so the screen
// says so rather than dressing it up.
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

    // A screen that lists humans lets you type a name. A roster is small at a
    // studio of six and not at a chain of forty, and the rule does not depend
    // on which one you are — the roll had this and these did not, which was an
    // accident of which screen got the pass.
    { component: 'Input', props: { placeholder: 'Search by name or email' }, ref: 'search', model: '$.search' },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    { if: '$.notice', then: { component: 'Notice', props: { tone: 'good', message: '$.notice' } }, else: '' },


    // Hiring, in place: unlike signing a member up there is no kiosk that
    // does only this, so it stays on the page it affects — and the role
    // options are the same four the charter defines, for the same reason.

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
          columns: [
            { label: 'Person', w: 2, cell: { kind: 'avatar', key: 'person_name', subKey: 'email' } },
            { label: 'Role', px: 104, cell: { kind: 'badge', key: 'role_display', hueKey: 'role_hue' } },
            { label: 'State', px: 96, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
            // THE VERBS LIVE IN ONE COLUMN. Two buttons meant two columns of
            // 92px holding labels that no longer fit — and a verb reads as an
            // imperative sentence ("Remove from staff"), not a two-word stub
            // squeezed to a width. The overflow holds as many as the row grows.
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

    // The role controls, one row per person, spelled out rather than hidden
    // behind a dropdown. Four roles is few enough to show, and a permission
    // change buried in a select is a permission change nobody reviews.
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
