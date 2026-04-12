import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Strict mode — halt on first violation.
// Good demo for "I'd rather crash than render wrong."
// ═══════════════════════════════════════════════════════════

export const strictHaltStory: StreamDemoStory = {
  id: 'strict-halt',
  name: 'Strict halt',
  description: 'Strict mode enters a terminal failed state on the first violation. No further updates are applied.',
  category: 'Validation',
  kind: 'stream-demo',
  pitch: {
    headline: 'When wrong is worse than slow.',
    body: 'Strict mode trades resilience for certainty. The moment the LLM emits a shape violation, the stream freezes at the last valid snapshot and final() rejects. Useful when you cannot afford to render partial-bad data — e.g. the output drives side effects you cannot roll back.',
  },
  demo: {
    schema: z.object({
      user: z.object({
        name: z.string(),
        email: z.string(),
      }),
      balance: z.number(),
      transfer: z.object({
        to: z.string(),
        amount: z.number(),
      }),
    }),
    initial: {
      user: { name: 'init', email: 'init@example.com' },
      balance: 1000,
      transfer: { to: '', amount: 0 },
    },
    // The LLM gets user fine, balance fine, but then hallucinates
    // the `amount` field as a string. In strict mode, the stream halts
    // right there — transfer.to was never written, and final() rejects.
    json: JSON.stringify({
      user: { name: 'Alice', email: 'alice@example.com' },
      balance: 2500,
      transfer: { to: 'Bob', amount: 'nine hundred dollars' },
    }),
    chunkMode: 'token',
    delayMs: 50,
    tokensPerSecond: 25,
    selectPaths: ['user', 'balance', 'transfer'],
    mode: 'strict',
    showModeSwitcher: true,
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({ schema, initial, mode: 'strict' });

stream.onError((err) => {
  // Fires exactly once in strict mode — then the stream is dead.
  alert(\`Stream failed at \${err.path}: \${err.message}\`);
});

try {
  // final() rejects with the failure error.
  const result = await stream.final();
  applyTransfer(result.transfer); // only runs if stream succeeded
} catch (e) {
  // Strict mode guarantees we never act on a shape-broken value.
  showReloadPrompt();
}`,
};
