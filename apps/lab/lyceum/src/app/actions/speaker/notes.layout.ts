import type { LayoutNode } from '@niscorp/nova';

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
