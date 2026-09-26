import type { LayoutNode } from '@niscorp/nova';

// The department's mark filling the cell, its sigil, and its clearance in plain
// words. The layout names no department: mark, sigil and remit are the
// department's own row, read like any other data.
export const badgeLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'department', 'remit'] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'Your department' }] },
    {
      component: 'Cell',
      props: { area: 'department', mark: '$.me.department_mark' },
      children: [
        { component: 'Sigil', props: { shape: '$.me.department_sigil', size: 'large' } },
        { component: 'Headline', props: { level: 'title' }, children: '{{$.me.department_name}}' },
      ],
    },
    { component: 'Cell', props: { area: 'remit', ink: 'highlight' }, children: [{ component: 'Text', children: '{{$.me.department_remit}}' }] },
  ],
};
