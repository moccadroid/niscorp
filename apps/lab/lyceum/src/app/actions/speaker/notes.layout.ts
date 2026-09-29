import type { LayoutNode } from '@niscorp/nova';

// The notes for the slide on screen, as bullets — read while talking —
// scrolling in their own region.
export const notesLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'notes'], rows: ['auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick', ink: 'highlight' }, children: [{ component: 'Label', children: 'Notes' }] },
    {
      component: 'Cell',
      props: { area: 'notes', scroll: 'y' },
      children: [{ for: '$.notes', as: 'note', key: 'position', do: { component: 'Text', children: '•  {{$note.note}}' } }],
    },
  ],
};
