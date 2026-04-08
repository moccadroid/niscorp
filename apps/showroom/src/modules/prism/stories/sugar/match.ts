import type { PrismStory } from '../../story-types';

export const matchStory: PrismStory = {
  id: 'match',
  name: '$match',
  description:
    'Sugar: filter an array of strings by substring containment. Desugars to `$filter + $contains`. Useful for the most common "search" pattern without the verbose canonical form.',
  category: 'Sugar',
  kind: 'transform',
  input: { tags: ['frontend', 'backend', 'devops', 'frontend-react', 'database'] },
  config: { $match: { over: { $ref: '$.tags' }, as: 'tag', search: { $const: 'front' } } },
  expected: ['frontend', 'frontend-react'],
};
