# @niscorp/solid

Structured Output Live Inference Decoding. Always-valid, schema-backed object streaming over partial JSON. Built for LLM structured output — see fields fill in as tokens arrive.

## Why not just `JSON.parse`?

Every LLM streaming library does some version of "repair the partial JSON, parse it, diff it." That's O(n) per token on the **full buffer** — quadratic over a stream. At 20 KB it's already sluggish.

Solid takes a different approach:

- **Incremental parser** — processes only new characters. No re-scanning.
- **Structural sharing** — snapshots reuse unchanged subtree references. No deep cloning.
- **Reference equality** — change detection is `===`, not deep comparison. O(1).

The result: linear scaling, 44x faster than naive repair+parse on a 10 KB payload, and a clean subscription API that tells you exactly when each subtree finalizes.

```
Payload scaling (50-byte chunks):

 Size(KB)  |  Naive   |  Solid
-----------|----------|--------
     1 KB  |  0.15ms  |  0.42ms
     5 KB  |  2.3ms   |  1.0ms
    10 KB  |  9.3ms   |  3.2ms
    20 KB  |  38ms    |  12ms

Scaling ratio (20KB/1KB ms/KB):
  Naive:  12.7x (quadratic)
  Solid:  1.4x  (linear)
```

## Install

```bash
pnpm add @niscorp/solid zod
```

## Quick Example

```typescript
import { createStream } from '@niscorp/solid';
import { z } from 'zod';

const schema = z.object({
  widget: z.object({ type: z.string(), title: z.string() }),
  response: z.string(),
  reasoning: z.string(),
});

const stream = createStream({
  schema,
  initial: { widget: { type: '', title: '' }, response: '', reasoning: '' },
});

// Subscribe to the full state
stream.on((value) => {
  console.log(value.widget.type);   // 'card' as soon as the token arrives
  console.log(value.response);      // grows character by character
});

// Subscribe to a subtree
stream.select('widget').onFinal((widget) => {
  console.log('Widget is done:', widget);
  // fires as soon as the parser moves past "widget" in the JSON
});

// Feed tokens from your LLM stream
for await (const chunk of llmStream) {
  stream.write(chunk);
}
stream.close();

// Or await the final result
const result = await stream.final();
```

## How it works

1. **Base object** — validated against your Zod schema at construction. This is the starting state. Every field has a value from the start.

2. **Incremental parsing** — each `write(chunk)` feeds characters into a state machine that tracks JSON structure, extracts values, and emits structural events. No `JSON.parse`, no buffer re-scanning.

3. **Structural sharing** — the parser mutates an internal object, then produces an immutable snapshot where only the changed paths get new references. Unchanged subtrees keep the same object reference as the previous snapshot.

4. **Subtree finalization** — JSON keys are written left-to-right. When the parser sees `"response":` after `"widget":{...}`, it knows widget is done. `select('widget').onFinal(...)` fires immediately, without waiting for the full stream to end.

## Documentation

- **[DESIGN.md](./DESIGN.md)** — Architecture, design decisions, and trade-offs

## API

```typescript
import { createStream } from '@niscorp/solid';

// Create a stream with schema + optional initial value
const stream = createStream({ schema, initial? });

// Feed streamed JSON chunks
stream.write(chunk: string): void

// Signal end of stream (forces finalization)
stream.close(): void

// Tear down all listeners and reject pending promises
stream.destroy(): void

// Read current merged state (always valid)
stream.current(): T

// Promise that resolves when root JSON object closes
stream.final(): Promise<T>

// Subscribe — fires immediately with current value, then on each change
stream.on(listener: (value: T) => void): () => void

// Subscribe to finalization — fires once when stream ends
stream.onFinal(listener: (value: T) => void): () => void

// Project into a subtree — returns a Stream<P> with its own on/onFinal
stream.select<P>(path: string): Stream<P>
```

`select()` streams are cached by path — `select('widget')` always returns the same instance. Selected streams use reference equality for change detection, so `select('widget.title').on(...)` only fires when the title actually changes, not when sibling fields update.

## License

MIT
