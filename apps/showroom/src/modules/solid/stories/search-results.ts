import type { StreamDemoStory } from '../story-types';
import * as recipe from './search-results.recipe';

export const searchResultsStory: StreamDemoStory = {
  id: 'search-results',
  name: 'Progressive search',
  description: 'Search results appear one by one as cards — each finalizes independently.',
  category: 'Live UI',
  kind: 'stream-demo',
  pitch: {
    headline: 'Show the first result before the last one exists.',
    body: 'Each search result is an array element. select("results.0").onFinal() fires the moment the parser moves to the second result. The user sees and can interact with result #1 while results #2 and #3 are still streaming in.',
  },
  recipe,
};
