import type { LayoutNode } from '@niscorp/nova';

// Your house, on top of your phone: its mark filling the cell, its sigil, its
// character. The layout names no house — the mark and the sigil are the
// house's own row, read like any other data.
export const crestLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick', 'house', 'character'] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'You belong to the' }] },
    {
      component: 'Cell',
      props: { area: 'house', mark: '$.me.house_mark' },
      children: [
        { component: 'Sigil', props: { shape: '$.me.house_sigil', size: 'large' } },
        { component: 'Headline', props: { level: 'title' }, children: '{{$.me.house_name}}' },
      ],
    },
    { component: 'Cell', props: { area: 'character' }, children: [{ component: 'Text', children: '{{$.me.house_character}}' }] },
  ],
};
