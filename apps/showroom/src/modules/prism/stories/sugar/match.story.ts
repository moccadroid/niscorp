import * as demo from './match.demo';
import source from './match.demo?raw';

export const story = {
  id: 'match',
  name: '$match',
  description: 'Sugar: filter an array of strings by substring containment. Desugars to `$filter + $contains`. Useful for the most common "search" pattern without the verbose canonical form.',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
