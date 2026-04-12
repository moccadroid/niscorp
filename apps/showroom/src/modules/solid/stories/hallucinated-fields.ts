import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Hallucinated fields — solid upholds the structural invariant
// even when the LLM sends the wrong type for a field.
// ═══════════════════════════════════════════════════════════

export const hallucinatedFieldsStory: StreamDemoStory = {
  id: 'hallucinated-fields',
  name: 'Hallucinated fields',
  description: 'The LLM sends wrong types for several fields. Flip between trust / recover / strict to see how solid handles it.',
  category: 'Validation',
  kind: 'stream-demo',
  pitch: {
    headline: "current() is always shape-valid — no matter what the LLM sends.",
    body: "This payload intentionally hallucinates: count is a string, items is an object, meta is null where a nested object is expected. In recover mode solid skips each bad value and preserves the prior one, so your UI never sees count + 1 crash or items.map fail. Strict mode halts the whole stream on first violation. Trust mode lets the mess through — included only so you can see why the invariant matters.",
  },
  demo: {
    schema: z.object({
      title: z.string(),
      count: z.number(),
      active: z.boolean(),
      items: z.array(z.object({ id: z.number(), label: z.string() })),
      meta: z.object({ model: z.string(), tokens: z.number() }),
    }),
    initial: {
      title: 'loading…',
      count: 0,
      active: false,
      items: [],
      meta: { model: 'unknown', tokens: 0 },
    },
    // An LLM that went wrong in five places:
    //   count:  number → string
    //   active: boolean → string
    //   items:  array   → object
    //   meta:   object  → null
    //   and a bogus extra field not in the schema
    json: JSON.stringify({
      title: 'Sales Report Q4',
      count: 'seventeen',
      active: 'yes please',
      items: { woops: 'this should be an array' },
      meta: null,
      bogus: 'extra field that the schema does not know about',
    }),
    chunkMode: 'token',
    delayMs: 30,
    tokensPerSecond: 40,
    selectPaths: ['title', 'count', 'active', 'items', 'meta'],
    mode: 'recover',
    showModeSwitcher: true,
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({
  schema,
  initial,
  mode: 'recover', // 'trust' | 'recover' | 'strict'
});

stream.onError((err) => {
  // Fires for each bad field. You know the path, the expected
  // kind, and the received kind.
  log(\`[\${err.phase}] \${err.path}: expected \${err.expected}, got \${err.received}\`);
});

stream.on((value) => {
  // These never crash — even when the LLM hallucinates types.
  // In recover mode, bad fields keep their prior value.
  statusBar.setText(value.title);           // always a string
  counter.setValue(value.count.toFixed(2));  // always a number
  list.setItems(value.items.map(i => i.label)); // always an array
});`,
};
