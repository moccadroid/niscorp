import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

export const destroyMidstreamStory: StreamDemoStory = {
  id: 'destroy-midstream',
  name: 'Destroy mid-stream',
  description: 'Cancel a stream mid-flight — state freezes, listeners detach, promises reject.',
  category: 'Lifecycle',
  kind: 'stream-demo',
  pitch: {
    headline: 'Clean cancellation, zero leaks.',
    body: 'Call destroy() at any point and everything stops. Listeners are removed, pending final() promises reject, selected streams detach. The last valid state is preserved. Essential for component unmounting, user cancellation, or timeout handling.',
  },
  demo: {
    schema: z.object({
      status: z.string(),
      progress: z.object({ current: z.number(), total: z.number(), label: z.string() }),
      result: z.string(),
    }),
    initial: {
      status: '',
      progress: { current: 0, total: 0, label: '' },
      result: '',
    },
    json: JSON.stringify({
      status: 'processing',
      progress: { current: 142, total: 500, label: 'Analyzing customer feedback entries...' },
      result: 'This result will never fully arrive because the stream will be destroyed mid-flight. The consumer called destroy() after getting enough data from the progress field. This is a perfectly valid pattern — you do not need to consume the entire stream.',
    }),
    chunkMode: 'token',
    delayMs: 20,
    tokensPerSecond: 50,
    selectPaths: ['status', 'progress', 'result'],
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({ schema, initial });

// Start streaming
for await (const chunk of llmStream) {
  stream.write(chunk);
}

// Cancel early — maybe the user navigated away
stream.destroy();
// - All on() listeners stop firing
// - Pending final() promises reject with '[solid] stream destroyed'
// - Selected streams detach
// - current() still returns the last valid state

// In React:
useEffect(() => {
  const stream = createStream({ schema, initial });
  // ... subscribe, write chunks
  return () => stream.destroy(); // cleanup on unmount
}, []);`,
};
