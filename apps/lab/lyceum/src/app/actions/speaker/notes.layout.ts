import type { LayoutNode } from '@niscorp/nova';

// Open on a laptop, shut on a phone until tapped, each screen its own.
export const notesLayout: LayoutNode = {
  component: 'Fold',
  props: { label: 'Notes', name: 'notes' },
  children: [{ for: '$.notes', as: 'note', key: 'position', do: { component: 'Text', children: '•  {{$note.note}}' } }],
};
