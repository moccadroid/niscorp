import type { PrismStory } from '../../story-types';

export const flatMapStory: PrismStory = {
  id: 'flat-map',
  name: '$flatMap',
  description:
    'Sugar: map over an array where each element produces an array, then flatten one level. Desugars to `$flatten + $map`. Classic for "expand each parent into its children."',
  category: 'Sugar',
  kind: 'transform',
  input: {
    folders: [
      { name: 'work', files: ['report.pdf', 'notes.md'] },
      { name: 'personal', files: ['photo.jpg'] },
      { name: 'archive', files: ['old.txt', 'older.txt', 'oldest.txt'] },
    ],
  },
  config: {
    $flatMap: {
      over: { $ref: '$.folders' },
      as: 'folder',
      body: { $get: { from: { $var: 'folder' }, path: ['files'] } },
    },
  },
  expected: ['report.pdf', 'notes.md', 'photo.jpg', 'old.txt', 'older.txt', 'oldest.txt'],
};
