import type { LayoutNode } from '@niscorp/nova';

// The notes for the slide on screen, scrolling in their own region.
export const notesLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'notes'], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'highlight' }, children: [{ component: 'Label', children: 'Notes' }] },
    {
      component: 'Cell',
      props: { area: 'notes', pad: 'none', scroll: 'y' },
      children: [{ component: 'Rows', props: { rows: '$.notes', rowKey: 'position', empty: 'No notes for this slide.', columns: [{ label: '', key: 'note', w: 1 }] } }],
    },
  ],
};
