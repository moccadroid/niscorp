# Jev — how far it goes

Measured against the live API (`POST https://api.typesafe.ai/v1/systemone`, `jev-latest` →
`jev-1.13.0`) on 2026-09-24, from a dev machine over the public internet, through
`@niscorp/signal`'s `systemone` adapter and raw `fetch`. Every state was synthetic with
known facts, so "accuracy" below is scored against ground truth, not eyeballed.

Docs: <https://docs.typesafe.ai/llms.txt> is the index. The pages that matter: `/models`
(limits, price), `/api` (wire, errors), `/model-jaggedness/jev-1.13` (what it is bad at),
`/patterns/fan-out` (many questions per call).

## TL;DR

- **The limit is tokens.** Question count and payload bytes don't matter on their own.
  64k tokens per request; 32,768 for state + the single longest question.
- **Width is close to free.** 2,000 yes/no questions in one call: 100% correct, ~2 s.
- **Encode state as plain lines, not JSON objects.** The same data costs about ⅓ of the
  tokens and ¼ of the latency.
- **Lookups survive a full state.** Counting and multi-hop questions don't, at any size.
- **Nothing returned 429**, even at 3.6M tokens in flight. The server queues, and latency
  grows instead.
- **Encore today (38 questions, ~13 KB, 3.8k tokens) uses ~6% of one call's budget.**

## Hard limits

| Limit | Value | Past it |
|---|---|---|
| Whole request (state + all questions) | **64k tokens** | `400 {"detail":{"error_type":"max_tokens_exceeded"}}` |
| State + the single longest question | **32,768 tokens** | same `400`. Measured: 32,680 passed, ~33,580 failed |
| `choice` options | **255** | `400 "Too many choices. Must have at most 255 choices."` |
| `score` levels | **10** (at least 2) | `400 "Too many score levels. Must have at most 10 levels."` |
| JSON nesting depth (state) | **64** | `400 api_usage_error "Request JSON nesting exceeds the maximum depth of 64."` |
| Questions per request | **≥ 1, no upper cap** — only the 64k budget | 0 questions → `422` (pydantic `too_short`) |
| Question name | no limit found | 2,000-character names and `/ . : space` all accepted |
| Rate (documented) | 250k tokens/s, 1,200 requests/min | `429` — never triggered (see Load) |

- **The two token budgets are separate.** 300 medium questions (~52k total) over a ~28k
  state passed: each question is small. A ~28k state plus one ~6k question failed.
- **Fixed overhead** is ~270 input tokens per request (1 question, trivial state).
- `output_tokens` is reported, but only input is billed.

## Width: questions per call

State: 200 items (`{id, color, city}` JSON, ~6.7k tokens). N nouls of the form "Is item X
<color>?", half of them true.

| N | Body | Latency | Input tokens | Accuracy |
|---:|---:|---:|---:|---:|
| 1 | 9 KB | 1195 ms* | 6,684 | 100% |
| 10 | 10 KB | 331 ms | 6,864 | 100% |
| 50 | 13 KB | 355 ms | 7,664 | 100% |
| 100 | 16 KB | 376 ms | 8,664 | 100% |
| 250 | 27 KB | 465 ms | 11,664 | 100% |
| 500 | 45 KB | 979 ms | 16,664 | 100% |
| 1,000 | 81 KB | 1,184 ms | 26,664 | 100% |
| 2,000 | 154 KB | 2,071 ms | 46,664 | 100% |
| 4,000 | 300 KB | — | — | `max_tokens_exceeded` |

\* The first call paid for the connection.

- A short noul costs **~20 tokens**. About 3,000 fit in one call.
- Up to ~250 questions, latency barely moves: it sits on a ~330 ms floor.
- Fatter questions (~60 tokens each) over a ~10k state:

  | Questions | Tokens | Latency |
  |---:|---:|---:|
  | 200 | 21k | 690 ms |
  | 700 | 42k | 1,150 ms |
  | 1,100 | 58k | 1,250 ms |
  | 1,500 | — | failed (over 64k) |

## State: encoding cost

The same 500 records (`id`, `color`, `city`), with one question:

| Encoding | Bytes | Tokens | Bytes/token | Latency |
|---|---:|---:|---:|---:|
| JSON array of objects | 23,410 | **16,284** | 1.44 | 1,214 ms |
| Columnar JSON (`{id:[…], color:[…]}`) | 12,426 | 9,296 | 1.34 | 337 ms |
| CSV blob | 9,914 | 6,245 | 1.59 | 327 ms |
| JSON array of strings | 10,400 | 5,828 | 1.78 | 345 ms |
| **One text blob, one record per line** | 9,899 | **4,828** | 2.05 | 330 ms |
| (English prose, for scale) | — | — | ~4.6 | — |

- JSON keys, quotes and braces are most of the cost. **Plain lines hold ~3.4× the records**
  of JSON objects in the same budget.
- JSON arrays of strings also cost per element: 5,000 short strings (`"line 123"`)
  overflowed the budget.
- The state ceiling in practice:
  - ~150 KB of prose (≈32.7k tokens);
  - ~3,000 records as lines (~28k tokens);
  - only ~600–700 records as JSON objects.

## Accuracy at scale

**Needle lookups across a growing JSON roster**: 20 id→city lookups spread evenly through it,
half of them true.

| Records | Tokens | Latency | Accuracy |
|---:|---:|---:|---:|
| 50 | 3k | 850 ms | 100% |
| 200 | 10k | 650 ms | 100% |
| 500 | 24k | 830 ms | 100% |
| 1,000 | — | — | over budget |

**A 255-way `choice`**: exactly one item out of 255 (~14.5k tokens) is purple, and every item id
is an option. Right in **5/5** trials, confidence 1.00, 380–1,225 ms.

**Harder questions at a near-full state** (3,000 records as lines, 27.8k tokens, 1.6 s):

| Question | p(yes) | Want | Result |
|---|---:|---|---|
| Lookup, first record (true / false) | 1.00 / 0.00 | yes / no | right |
| Lookup, middle (true / false) | 0.97 / 0.01 | yes / no | right |
| Lookup, last (true / false) | 0.99 / 0.01 | yes / no | right |
| Does id K02321 exist? | 0.99 | yes | right |
| Does id K09999 exist? | 0.38 | no | right, but not by much |
| More than 360 red items? (371) | 0.24 | yes | **wrong** |
| More than 420 red items? | 0.22 | no | right (by chance) |
| Is the item listed after X in <city>? (true) | 0.36 | yes | **wrong** |
| … (false) | 0.11 | no | right |

This matches the jaggedness page:
- **Direct lookup is position-proof across the whole window.** We saw no lost-in-the-middle
  effect.
- **Counting and "the next row" style indirection fail.** Count in code. Resolve
  neighbours in code and ask about the resolved row.
- **Existence of a missing thing is weak** (0.38 is close to 0.5). If absence matters, give a
  `choice` with an explicit "none" option.
- The docs warn about **context rot**: irrelevant state costs accuracy. We didn't see it on
  lookups, but questions needing judgement are more exposed. Filter in code first.

## Load and rate limits

**Warm vs cold connections.** ~5k-token requests with 20 nouls, each burst run twice in a
row:

| Concurrent | Cold p50 / p95 | Warm p50 / p95 |
|---:|---|---|
| 1 | 423 ms | — |
| 10 | 1,392 / 1,431 ms | 470 / 1,250 ms |
| 25 | 1,287 / 1,463 ms | 2,398 / 2,793 ms |
| 50 | 2,149 / 3,738 ms | 1,799 / 3,718 ms |

**Fat bursts.** ~60k-token requests (1,300 questions each):

| Concurrent | OK | p50 | p95 | Wall | Throughput |
|---:|---:|---:|---:|---:|---:|
| 1 | 1/1 | 1,885 ms | — | 1.9 s | 25k tok/s |
| 10 | 10/10 | 4,063 ms | 4,378 ms | 4.4 s | 105k tok/s |
| 30 | 30/30 | 6,853 ms | 8,918 ms | 9.5 s | 146k tok/s |
| 60 | 60/60 | 11,408 ms | 14,099 ms | 15.3 s | 182k tok/s |

- **We never got a `429`**, even at 3.6M tokens in 15 s. The server **queues**:
  throughput levels off around ~180k tokens/s and per-request latency pays for it. (The
  docs say limits "are adjusting dynamically".) signal's adapter doesn't retry, so a real
  `429`/`529` would surface as `E_PROVIDER_ERROR`. The docs recommend exponential backoff
  that honours `retry-after`.
- **Parallelism doesn't beat width.** One wide call is faster than the same questions spread
  across calls (the docs' GDPR cookbook: 10× faster and 12× cheaper). Shard only when you are
  past 64k.
- **A new TLS connection costs ~700 ms** (curl, cold: 1.1–1.45 s for encore's body; warm
  server time is ~400 ms). Connection warmth matters more than payload size for a typing
  loop, which is why encore's `keep-warm.ts` exists.

## Cost

$0.042 per million input tokens; output is free.

- A maximum-size (64k) call costs ≈ **$0.0027**.
- An encore pass (3.8k) costs ≈ **$0.00016**, so 10,000 passes cost ≈ $1.60.
- The whole research run above cost well under $1.

## Encore today

`pnpm --filter encore request "storm at 9 move headliner to the tent"` produces this body:

- **Questions:** 38 (23 noul, 13 choice, 2 score).
- **Choice size:** the largest has 7 options (candidate lists are 8).
- **State:** `{ line, heard }`.
- **Size:** 13.5 KB, **3,823 input tokens**.
- **Latency:** ~1.1–1.4 s on a fresh curl connection, ~400 ms warm.

### Headroom

**Wider passes.** ~17× the questions, e.g. every card × every field, asked every keystroke.
Latency stays sub-second up to ~25–30k tokens. `derive.ts`'s "sharded only past the
provider's limits" is a real path only past ~3,000 short questions.

**Candidate lists.** They can grow from 8 to 255 per field.

**A world snapshot in the state.** ~25k tokens fits if it is written as lines, not JSON.
The 32k limit is on state plus the *longest* question, so one long question shrinks the
room for state.

### What not to ask Jev

Counts, arithmetic, dates as ordered quantities, "the next/previous row", or anything with
two hops. Resolve those in code and ask about the result.
