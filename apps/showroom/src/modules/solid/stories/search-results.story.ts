import * as demo from './search-results.demo';
import source from './search-results.demo?raw';

export const story = {
  id: 'search-results',
  name: 'Progressive search',
  description: 'Search results appear one by one as cards — each finalizes independently.',
  category: 'Live UI',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};
