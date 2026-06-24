import type { LayoutNode } from '@niscorp/nova';

// Literal sidebar layout: a workspace header, two nav sections, a Settings item,
// and a user footer. Each NavItem carries its own `id` and the bound `activeId`
// ($.active) so exactly one highlights; its `ref` lets the action's triggers
// route + update `$.active` on click.
export const sidebarLayout: LayoutNode = {
  component: 'Box',
  props: { bg: 'sunken', border: 'right', width: 232, h: '100%' },
  children: {
    component: 'Stack',
    props: { h: '100%' },
    children: [
      // ─── Workspace header ──────────────────────────────────
      {
        component: 'Box',
        props: { px: 14, py: 13, border: 'bottom' },
        children: {
          component: 'Row',
          props: { gap: 10, justify: 'between', align: 'center' },
          children: [
            {
              component: 'Row',
              props: { gap: 10, align: 'center' },
              children: [
                { component: 'Box', props: { bg: 'brand', glow: true, radius: 7, width: 28, h: 28, center: true }, children: { component: 'Icon', props: { name: 'zap', size: 15 } } },
                {
                  component: 'Stack',
                  props: { gap: 0 },
                  children: [
                    { component: 'Text', props: { size: 'md', weight: 680 }, children: 'Relay' },
                    { component: 'Text', props: { size: 'xs', color: 'mute' }, children: 'Acme Inc' },
                  ],
                },
              ],
            },
            { component: 'Icon', props: { name: 'chevron-down', size: 15 } },
          ],
        },
      },
      // ─── Nav ───────────────────────────────────────────────
      {
        component: 'Stack',
        props: { gap: 1, pad: 10, grow: true },
        children: [
          { component: 'Box', props: { px: 8, py: 6 }, children: { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Workspace' } },
          { component: 'NavItem', ref: 'nav-home', props: { id: 'home', activeId: '$.active', icon: 'home', label: 'Home' } },
          { component: 'NavItem', ref: 'nav-tasks', props: { id: 'tasks', activeId: '$.active', icon: 'check-square', label: 'My tasks', count: '$.counts.tasks' } },
          { component: 'NavItem', ref: 'nav-pipeline', props: { id: 'pipeline', activeId: '$.active', icon: 'trending-up', label: 'Pipeline' } },
          { component: 'Box', props: { px: 8, py: 6 }, children: { component: 'Text', props: { size: 'xs', weight: 600, color: 'mute', upper: true }, children: 'Records' } },
          { component: 'NavItem', ref: 'nav-contacts', props: { id: 'contacts', activeId: '$.active', icon: 'users', label: 'Contacts', count: '$.counts.contacts' } },
          { component: 'NavItem', ref: 'nav-companies', props: { id: 'companies', activeId: '$.active', icon: 'building', label: 'Companies', count: '$.counts.companies' } },
          { component: 'NavItem', ref: 'nav-deals', props: { id: 'deals', activeId: '$.active', icon: 'target', label: 'Deals', count: '$.counts.deals' } },
        ],
      },
      // ─── Settings + user footer ────────────────────────────
      {
        component: 'Box',
        props: { px: 10, py: 8, border: 'top' },
        children: { component: 'NavItem', ref: 'nav-settings', props: { id: 'settings', activeId: '$.active', icon: 'settings', label: 'Settings' } },
      },
      {
        component: 'Box',
        props: { border: 'top', px: 14, py: 12 },
        children: {
          component: 'Row',
          props: { gap: 10, justify: 'between', align: 'center' },
          children: [
            {
              component: 'Row',
              props: { gap: 10, align: 'center' },
              children: [
                { component: 'Avatar', props: { name: 'Alex Morgan' } },
                {
                  component: 'Stack',
                  props: { gap: 1 },
                  children: [
                    { component: 'Text', props: { size: 'sm', weight: 560 }, children: 'Alex Morgan' },
                    { component: 'Text', props: { size: 'xs', color: 'mute' }, children: 'Workspace owner' },
                  ],
                },
              ],
            },
            { component: 'Icon', props: { name: 'more', size: 16 } },
          ],
        },
      },
    ],
  },
};
