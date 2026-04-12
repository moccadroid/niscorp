import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Finalize-phase constraints — .min/.max/.regex/.refine etc.
// Fires only after a field's value has fully arrived, so partial
// strings don't create false positives during streaming.
// ═══════════════════════════════════════════════════════════

export const finalizeConstraintsStory: StreamDemoStory = {
  id: 'finalize-constraints',
  name: 'Finalize-phase constraints',
  description: 'Opt in to constraint validation at field-finalize time — catches .min, .max, .regex, .refine without tripping on mid-stream partial strings.',
  category: 'Validation',
  kind: 'stream-demo',
  pitch: {
    headline: 'Schema constraints, enforced at the right moment.',
    body: 'Kind checks alone catch "array where string expected". But what about `email()` or `min(10)`? You cannot check those on a half-streamed string — the field is legitimately too short until the closing quote arrives. Setting constraints: "finalize" runs the sub-schema at the exact moment each field closes, so partial strings never trip constraints they will eventually satisfy.',
  },
  demo: {
    schema: z.object({
      username: z.string().min(5).max(20),
      email: z.string().email(),
      age: z.number().int().positive(),
      priority: z.enum(['low', 'medium', 'high']),
      tags: z.array(z.string().min(2)),
    }),
    initial: {
      username: 'unknown',
      email: 'unknown@example.com',
      age: 1,
      priority: 'low' as const,
      tags: ['--'],
    },
    // Two constraint violations lurk in here:
    //   username "al" — too short (min 5)
    //   age -3 — not positive
    //   priority "urgent" — not in enum
    //   tags ["x"] — element too short
    // The kind checks all pass (string/number/string/array). Only the
    // finalize-phase run catches these.
    json: JSON.stringify({
      username: 'al',
      email: 'alice@example.com',
      age: -3,
      priority: 'urgent',
      tags: ['ok', 'x'],
    }),
    chunkMode: 'token',
    delayMs: 40,
    tokensPerSecond: 30,
    selectPaths: ['username', 'email', 'age', 'priority', 'tags'],
    mode: 'recover',
    constraints: 'finalize',
    showModeSwitcher: true,
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({
  schema,
  initial,
  mode: 'recover',
  constraints: 'finalize', // also run sub-schema safeParse at finalize
});

stream.onError((err) => {
  if (err.phase === 'finalize') {
    // A field arrived with a valid type, but failed its constraints.
    // (min/max/regex/refine/enum/etc.)
    showFieldError(err.path, err.message);
  }
});`,
};
