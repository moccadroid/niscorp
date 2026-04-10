import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

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
  demo: {
    schema: z.object({
      query: z.string(),
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
        relevance: z.number(),
      })),
      answer: z.string(),
    }),
    initial: { query: '', results: [], answer: '' },
    json: JSON.stringify({
      query: 'How does structural sharing work in immutable data structures?',
      results: [
        {
          title: 'Persistent Data Structures and Structural Sharing',
          url: 'https://example.com/persistent-ds',
          snippet: 'Structural sharing allows new versions of a data structure to reuse unchanged parts of the previous version. Only the path from root to the changed node is copied — everything else is shared by reference.',
          relevance: 0.97,
        },
        {
          title: 'Copy-on-Write Trees in Practice',
          url: 'https://example.com/cow-trees',
          snippet: 'Copy-on-write (COW) is the mechanism behind structural sharing. When a node is modified, a new copy is created for that node and all its ancestors, while siblings keep their original references.',
          relevance: 0.89,
        },
        {
          title: 'Immutable.js: How It Works Under the Hood',
          url: 'https://example.com/immutablejs-internals',
          snippet: 'Immutable.js uses hash array mapped tries (HAMTs) with structural sharing to provide O(log32 N) operations while maintaining full immutability guarantees.',
          relevance: 0.74,
        },
      ],
      answer: 'Structural sharing means that when you create a modified copy of a data structure, the new version shares all unchanged subtrees with the original. Only the modified path is newly allocated. This gives you immutability with near-zero copying cost.',
    }),
    chunkMode: 'token',
    delayMs: 12,
    tokensPerSecond: 100,
    selectPaths: ['query', 'results', 'results.0', 'results.1', 'results.2', 'answer'],
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({ schema, initial: { query: '', results: [], answer: '' } });

// Render results as they appear
stream.select('results').on((results) => {
  renderResultsList(results); // list grows as items stream in
});

// Highlight the first result as soon as it's complete
stream.select('results.0').onFinal((first) => {
  highlightTopResult(first); // fires before result #2 starts
});

// Show the summary answer last
stream.select('answer').onFinal((answer) => {
  showAnswerCard(answer);
});`,
};
