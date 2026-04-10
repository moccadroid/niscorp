# @niscorp/solid — Design

How the library works, what decisions were made, and why.

---

## The problem

LLMs that produce structured output stream JSON token by token. Before the last token arrives, the JSON is incomplete — you can't `JSON.parse` it. But you want to show fields to the user as they appear, react to subtrees as they finalize, and never expose an invalid state.

The naive solution is to repair the partial JSON (close brackets, trim dangling tokens) and re-parse the entire buffer on every chunk. This works but scales quadratically — every write re-scans everything that came before it.

Solid takes a different approach.

---

## Core idea

The streamed JSON is not the state. The state is a valid object that exists from the start.

```ts
const stream = createStream({ schema, initial });
```

`initial` is validated against the Zod schema at construction. Every `current()` call returns a valid object — before, during, and after streaming. The incoming JSON progressively overwrites fields in this object as they're parsed.

This means consumers can render and act on the state immediately. There is no "waiting for valid JSON" phase.

---

## Architecture

```
write(chunk)
  │
  ▼
┌─────────────────────────┐
│  Incremental parser      │  O(chunk) — processes only new characters
│  ├─ Scanner state        │  tracks strings, escapes, containers, paths
│  ├─ Value extraction     │  writes parsed values into a mutable root object
│  ├─ Dirty tracking       │  records which paths were modified
│  └─ Event emission       │  structural events for finalization
└────────────┬────────────┘
             │
     ┌───────┴───────┐
     │               │
     ▼               ▼
┌──────────┐  ┌──────────────────┐
│ Snapshot  │  │ Finalization     │
│ engine    │  │ tracker          │
│           │  │                  │
│ Structural│  │ Marks paths as   │
│ sharing   │  │ final based on   │
│ from prev │  │ parser events    │
│ snapshot  │  │                  │
└─────┬─────┘  └────────┬────────┘
      │                 │
      ▼                 ▼
┌──────────────────────────────┐
│  Stream (root + selections)  │
│  ├─ on() — reference ===     │
│  ├─ onFinal()                │
│  ├─ select() — cached        │
│  └─ destroy()                │
└──────────────────────────────┘
```

### Files

| File | Responsibility |
|------|----------------|
| `incremental-parser.ts` | Scanner, value extraction, dirty tracking, structural sharing snapshots |
| `finalization-tracker.ts` | Determines when paths become final based on parser events |
| `create-stream.ts` | Root stream factory, listener management, write pipeline |
| `selected-stream.ts` | Projected subtree streams with independent subscriptions |
| `types.ts` | Public and internal types, FinalState factory |
| `path.ts` | Path splitting, traversal, projection |
| `deep-equal.ts` | Structural equality (used only in tests, not in hot path) |
| `derive-defaults.ts` | Derives valid base objects from Zod schema defaults |

---

## Key decisions

### 1. Incremental parsing, not repair+parse

**Decision:** Build a custom incremental JSON parser instead of repairing partial JSON and calling `JSON.parse`.

**Why:** The repair+parse approach re-scans the entire accumulated buffer on every `write()`. Over N total characters in ~N/100 chunks, total work is O(N²). For a 20 KB response that's measurably slow (~38ms). The incremental parser maintains scanner state between calls and processes only new characters — O(N) total.

**Trade-off:** We own the parser. If a JSON edge case breaks, it's our bug. We mitigate this with thorough tests (121 unit/integration tests + e2e streaming tests).

**Result:** 44x faster for character-by-character streaming of a 10 KB payload.

### 2. Structural sharing, not deep cloning

**Decision:** Produce immutable snapshots using copy-on-write structural sharing instead of `structuredClone`.

**Why:** The parser mutates an internal object. Consumers need immutable values (so stored references don't change under them). `structuredClone` copies the entire object tree — O(object_size) per write. Structural sharing only creates new objects along dirty paths; everything else keeps the same reference from the previous snapshot.

**How it works:**
- The parser tracks which paths were modified during a `write()` via a `dirtyParents` map (parent path → set of changed child keys).
- The `snapshot(previous)` method walks the tree. At each node, if no children are dirty, it returns the `previous` reference directly. If children are dirty, it creates a new object with the dirty children replaced and clean children shared.
- After the snapshot, the dirty map is cleared.

**Result:** O(dirty_paths × depth) per snapshot instead of O(object_size). For a write that changes one string field at depth 3, that's ~3 object spreads instead of cloning a 20-field object tree.

### 3. Reference equality, not deep comparison

**Decision:** Selected streams use `===` for change detection instead of `deepEqual`.

**Why:** Structural sharing guarantees that unchanged subtrees keep the same object reference. If `snapshot.widget === previousSnapshot.widget`, the widget didn't change. This makes change detection O(1) instead of O(subtree_size).

**Consequence:** `select('widget').on(...)` only fires when the widget subtree actually changed. It does NOT fire when sibling fields (like `response`) change — even though the root object is new, the widget reference is shared.

### 4. Partial string visibility

**Decision:** String values are visible character by character as they stream in, not only when the closing quote arrives.

**Why:** LLM responses often contain long text fields. Waiting for the closing quote means the user sees nothing until the entire field is complete. By setting the partial string value on every character, `on(...)` subscribers see the text grow in real time.

**How:** The parser calls `setValue(valueBuffer)` on every non-escape character while inside a string. The dirty tracking and snapshot machinery handle the rest.

### 5. Skip-if-unchanged for setValue

**Decision:** The parser checks `value !== existing` before marking a path dirty.

**Why:** Without this, writing `{"type":""}` when the base already has `type: ""` would create a new snapshot (dirty flag set), which would trigger notifications and create new object references — even though nothing actually changed. The `!==` check prevents this.

**For primitives:** `=== ` catches identity. `"card" !== ""` is true (changed). `"" !== ""` is false (skip).

**For containers:** New objects/arrays created by `enterContainer` always have a different reference, so `!==` always holds. Correct — a new container IS a change.

### 6. Left-to-right finalization

**Decision:** Subtree finalization is based on parser position, not value completeness.

**Why:** JSON objects are ordered. When the parser sees key `"response"` at root depth, it knows `"widget"` can never receive more data — the producer has moved on. This is a structural guarantee, not a heuristic.

**Assumption:** Producers emit keys in a deliberate order. LLM structured output does this naturally — the model writes fields left to right. Consumers should place immediately useful fields first (UI/render → text → reasoning → metadata).

**Implementation:** The finalization tracker maintains a `keysPerContainer` map. When a new key enters, all previous sibling keys (and their descendants) are finalized. When a container closes, all its children are finalized.

### 7. Events decouple parsing from finalization

**Decision:** The parser emits `ParserEvent` objects that the finalization tracker consumes, rather than the tracker being embedded in the parser.

**Why:** Separation of concerns. The parser knows about JSON syntax. The tracker knows about path finalization semantics. Neither needs to know about the other's internals. Events are the interface.

**Event types:** `enterObject`, `leaveObject`, `enterArray`, `leaveArray`, `enterKey`, `enterIndex`, `valueComplete`.

### 8. Selected streams are projections, not copies

**Decision:** `select('widget')` returns a lightweight wrapper that projects from the root state, not an independent stream with its own parse buffer.

**Why:** All parsing happens once at root. Selected streams are just lenses into the root state. They subscribe to root change signals (value-free — no type casting needed), project their subtree via `getByPath`, and compare with the previous reference.

**Caching:** `select('widget')` always returns the same stream instance. The cache is a `Map<string, Stream>` on the root.

### 9. Factory functions, not classes

**Decision:** Follow the codebase style guide — factory functions returning explicit interfaces.

**Why:** Closures for private state, explicit return objects for public surface. No `this` binding issues. Testable, composable, tree-shakeable.

### 10. Element-level array merge

**Decision:** Array elements are merged by index, not replaced wholesale.

**Why:** With wholesale replacement, `select('items.0')` would see a "change" on every write that touches the array — because the array reference is new even if index 0 didn't change. Element-level merge means each index is tracked independently. The finalization tracker treats array indices like object keys.

---

## Performance characteristics

### Per-write cost

| Operation | Complexity |
|-----------|-----------|
| Parser scan | O(chunk_length) |
| Dirty tracking | O(depth) per value set |
| Snapshot | O(dirty_paths × depth) |
| Finalization check | O(events) |
| Selected stream notify | O(1) per selection (reference ===) |

Total per-write: **O(chunk_length + dirty_count × depth)**

### Scaling

| Payload | Chunks (50B) | Total time |
|---------|-------------|-----------|
| 1 KB | 21 | 0.4ms |
| 5 KB | 105 | 1.0ms |
| 10 KB | 210 | 3.2ms |
| 20 KB | 419 | 12ms |

Scaling ratio (20KB/1KB ms/KB): **1.4x** — effectively linear.

---

## What this library is not

- **Not a generic JSON parser.** It's purpose-built for schema-backed LLM streaming.
- **Not a diff engine.** It doesn't compute patches or deltas. It tracks dirty paths for structural sharing.
- **Not a validation engine.** Zod validates once at construction. The parser trusts that the LLM produces schema-conforming JSON.
- **Not a recovery tool.** If the LLM sends malformed JSON, the parser ignores unparseable tokens and keeps the last valid state. It doesn't guess or repair.

---

## Public API

```ts
type Stream<T> = {
  write: (chunk: string) => void;
  close: () => void;
  destroy: () => void;
  current: () => T;
  final: () => Promise<T>;
  on: (listener: (value: T) => void) => () => void;
  onFinal: (listener: (value: T) => void) => () => void;
  select: <P = unknown>(path: string) => Stream<P>;
};

const createStream: <T>(options: {
  schema: z.ZodType<T>;
  initial?: T;
}) => Stream<T>;
```

Eight methods. That's the whole product.
