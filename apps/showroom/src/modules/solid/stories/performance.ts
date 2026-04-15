import type { StreamDemoStory } from '../story-types';
import * as recipe from './performance.recipe';

export const performanceStory: StreamDemoStory = {
  id: 'performance',
  name: 'Performance (10 KB)',
  description: 'Stream a large payload character by character and watch the timing.',
  category: 'Performance',
  kind: 'stream-demo',
  pitch: {
    headline: '10,000 characters. Linear time.',
    body: "This demo streams a 10 KB payload character by character — the worst case for any streaming parser. Naive repair+parse takes ~420ms (quadratic scaling). Solid's incremental parser with structural sharing completes in ~10ms. Watch the throughput counter.",
  },
  recipe,
};
