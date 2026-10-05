# @niscorp/solid

Structured Output Live Inference Decoding. Always-valid, schema-backed object streaming over partial JSON. Built for LLM structured output — see fields fill in as tokens arrive.

## Why not just `JSON.parse`?

Every LLM streaming library does some version of "repair the partial JSON, parse it, diff it." That's O(n) per token on the **full buffer** — quadratic over a stream. At 20 KB it's already sluggish.

Solid takes a different approach:

- **Incremental parser** — processes only new characters. No re-scanning.
- **Structural sharing** — snapshots reuse unchanged subtree references. No deep cloning.
- **Reference equality** — change detection is `===`, not deep comparison. O(1).
- **Always-valid invariant** — the parser kind-checks every value against the schema at the moment its type is known, so a value of the wrong JSON kind is never written into `current()`, whatever the LLM sends. (`trust` mode switches the check off, and a field whose schema is `z.lazy`, an intersection or a pipe is not kind-checked.)

The result: linear scaling, 44x faster than naive repair+parse on a 10 KB payload, a clean subscription API that tells you exactly when each subtree finalizes, and a structural contract that holds even when the model hallucinates the wrong type for a field.

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

// Observe validation errors — fires when the LLM sends wrong types
stream.onError((err) => {
  console.warn(`[${err.phase}] ${err.path}: expected ${err.expected}, got ${err.received}`);
});

// Feed tokens from your LLM stream
for await (const chunk of llmStream) {
  stream.write(chunk);
}
stream.close();

// Or await the final result
const result = await stream.final();
```

## Validation modes

Every stream outside `trust` mode enforces the structural invariant: where the kind check applies, a value of the wrong JSON kind is not written into `current()`. When the LLM sends a value whose JSON kind doesn't match (a string where a number was expected, an array where an object lives, a field not in the schema), solid reacts based on `mode`:

```typescript
createStream({ schema, initial, mode: 'recover' })   // default
createStream({ schema, initial, mode: 'strict' })
createStream({ schema, initial, mode: 'trust' })
```

| Mode | Behavior |
|---|---|
| `recover` (default) | Reject the bad value, keep the prior valid one, emit `onError`, continue streaming. One hallucinated field doesn't kill rendering. |
| `strict` | Enter a terminal failed state on first violation. `current()` freezes, further writes are no-ops, `final()` rejects. |
| `trust` | No validation. Escape hatch for debugging or for producers you fully control. Discouraged. |

### Constraint validation

Kind checks catch the structural foot-guns (map-over-a-string, add-to-a-string). For constraint checks — `.min`, `.max`, `.regex`, `.email`, `.int`, `.refine` — opt into `constraints: 'finalize'`:

```typescript
createStream({ schema, initial, constraints: 'finalize' })
```

This runs the sub-schema `safeParse` at the exact moment each field closes in the stream, so partial strings never trip constraints they'll eventually satisfy. Violations emit `onError` with `phase: 'finalize'`. A violation is reported, not undone: the value stays in `current()` and `final()`. In `strict` mode it also fails the stream, which stays frozen with that value in it.

## How it works

1. **Base object** — validated against your Zod schema at construction. This is the starting state. Every field it holds has a value from the start. An object the reply creates (a list row, an object where the base has `null` or nothing, a record entry) has no base: it starts empty and gets its keys as they arrive.

2. **Incremental parsing** — each `write(chunk)` feeds characters into a state machine that tracks JSON structure, extracts values, and emits structural events. No `JSON.parse`, no buffer re-scanning. What is written should be the JSON value and nothing else. A code fence around it is ignored, and so is text with no double quote, bracket or brace in it. A `"` in text before the JSON is read as a string where the root belongs: an `onError` (`[solid] <root>: expected object, got string`) in `recover`, a failed stream in `strict`. A bracket or brace in text before the JSON is read as the root itself: the stream ends there, on the initial value or, in `strict`, sometimes as a failure.

3. **Value-open validation** — the moment the parser detects a value's JSON kind (`{`, `[`, `"`, digit, `t`/`f`/`n`), it checks it against the schema. If the kind doesn't match (string where number expected, array where object lives), the parser enters **skip-mode** — consuming the entire bad subtree without writing, dirtying, or emitting anything. The prior valid value stays in place.

4. **Structural sharing** — the parser mutates an internal object, then produces an immutable snapshot where only the changed paths get new references. Unchanged subtrees keep the same object reference as the previous snapshot.

5. **Subtree finalization** — JSON keys are written left-to-right. When the parser sees `"response":` after `"widget":{...}`, it knows widget is done. `select('widget').onFinal(...)` fires immediately, without waiting for the full stream to end.

6. **Finalize-phase constraints** (opt-in) — when each field closes, the sub-schema `safeParse` runs once. Catches `.min`, `.regex`, `.email`, `.refine` — constraints that can't be checked mid-stream without false positives.

## What others do

| Library | Partial validation | Constraint-at-finalize | Skip bad subtrees | Mode switching |
|---|---|---|---|---|
| **Solid** | Kind-check at value-open | Sub-schema safeParse at finalize | Skip-mode, keep prior value | trust / recover / strict |
| Vercel AI SDK (`streamObject`) | `DeepPartial<T>`, no runtime check | None — end-of-stream only | No — bad data lands in tree | No |
| Instructor | Explicitly unsupported during streaming | None | No | No |
| LangChain | End-of-stream only | End-of-stream only | No | No |

## Documentation

- **[DESIGN.md](./DESIGN.md)** — Architecture, design decisions, and trade-offs

## API

```typescript
import { createStream } from '@niscorp/solid';

// Create a stream with schema + optional initial value + validation opts
const stream = createStream({
  schema,
  initial?,
  mode?: 'trust' | 'recover' | 'strict',  // default: 'recover'
  constraints?: 'kind' | 'finalize',       // default: 'kind'
});

// Feed streamed JSON chunks
stream.write(chunk: string): void

// Signal end of stream (forces finalization)
stream.close(): void

// Tear down all listeners and reject pending promises
stream.destroy(): void

// Read current merged state (always structurally valid)
stream.current(): T

// Promise that resolves when root JSON object closes.
// Rejects if the stream entered strict failure.
stream.final(): Promise<T>

// Subscribe — fires immediately with current value, then on each change
stream.on(listener: (value: T) => void): () => void

// Subscribe to finalization — fires once when stream ends
stream.onFinal(listener: (value: T) => void): () => void

// Subscribe to validation errors — kind-check failures at value-open,
// constraint failures at finalize (if constraints: 'finalize')
stream.onError(listener: (err: StreamError) => void): () => void

// Project into a subtree — returns a Stream<P> with its own on/onFinal/onError.
// Selected streams see only errors at-or-below their path.
stream.select<P>(path: string): Stream<P>
```

`select()` streams are cached by path — `select('widget')` always returns the same instance. Selected streams use reference equality for change detection, so `select('widget.title').on(...)` only fires when the title actually changes, not when sibling fields update.

## License

Apache-2.0
