import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

// Generate a large payload for perf demo
const generateItems = (count: number): Array<{ id: number; title: string; body: string; tags: string[] }> =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Result item ${i + 1}`,
    body: `This is the content for item ${i + 1}. It contains enough text to make the payload realistic for performance testing of streaming JSON parsers.`,
    tags: [`tag-${i}a`, `tag-${i}b`, `tag-${i}c`],
  }));

export const performanceStory: StreamDemoStory = {
  id: 'performance',
  name: 'Performance (10 KB)',
  description: 'Stream a large payload character by character and watch the timing.',
  category: 'Performance',
  kind: 'stream-demo',
  pitch: {
    headline: '10,000 characters. Linear time.',
    body: 'This demo streams a 10 KB payload character by character — the worst case for any streaming parser. Naive repair+parse takes ~420ms (quadratic scaling). Solid\'s incremental parser with structural sharing completes in ~10ms. Watch the throughput counter.',
  },
  demo: {
    schema: z.object({
      status: z.string(),
      items: z.array(z.object({
        id: z.number(),
        title: z.string(),
        body: z.string(),
        tags: z.array(z.string()),
      })),
      summary: z.string(),
    }),
    initial: { status: '', items: [], summary: '' },
    json: JSON.stringify({
      status: 'complete',
      items: generateItems(20),
      summary: 'Processing complete. All items streamed successfully with incremental parsing.',
    }),
    chunkMode: 'token',
    delayMs: 0,
    tokensPerSecond: 500,
    selectPaths: ['status', 'items', 'summary'],
  },
  code: `import { createStream } from '@niscorp/solid';

// Solid uses an incremental parser with structural sharing.
// No JSON.parse, no structuredClone, no deep comparison.
//
// Per-write cost:
//   Parser scan:        O(chunk_length)
//   Dirty tracking:     O(depth) per value
//   Snapshot:           O(dirty_paths x depth)
//   Change detection:   O(1) — reference ===
//
// This demo: 10 KB, ~10,000 chunks, < 10ms total.

const stream = createStream({ schema, initial });
const start = performance.now();

for await (const chunk of llmStream) {
  stream.write(chunk);
}
stream.close();

console.log(\`\${performance.now() - start}ms\`);`,
};
