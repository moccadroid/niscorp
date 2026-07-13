# Signal — Design Document

Architecture, design decisions, and trade-offs behind `@niscorp/signal`.
For usage documentation, see [DOCS.md](./DOCS.md).

One sentence: **what comes out conforms to the schema that went in, on
every provider — or you get a typed failure with evidence.**

---

## The layer map

```
types.ts       the public contract (incl. StepOutcome / Rejection / WireReport)
registry.ts    provider DATA: baseUrl, capabilities, adapter id, wire strategy ids
adapters/      byte movers, one per WIRE PROTOCOL (not per vendor) — throw-and-wrap, zero policy
wire/          RESPONSE side: repair.ts (mechanisms) → router.ts (classify) → strategies/ (provider quirks)
transport/     REQUEST side: resolve.ts (respond | native | emit) + protocol.ts (ALL prompt prose)
signal.ts      the client: step/stepStream = the ONE execution core, builders, embed, count
run.ts         complete()/stream(): one loop over step — runStream is the core, runComplete drains it
```

The seam rule: **wire is the response side, transport is the request
side, and everything between them is `step()`.** A change touching both
sides is two changes.

## Placement rules (decided once, checkable in review)

- A vendor is a **registry row**. Adapters exist per wire protocol;
  Groq = the openai-compatible adapter + registry data (capabilities,
  wire strategy ids). Never write a vendor adapter that duplicates a
  protocol.
- A provider pathology is a **wire strategy**: one file under
  `wire/strategies/`, fixtures from the real error/response body, id
  listed on the provider's registry entry. Two hooks: `error` (recover
  a `Rejection` from a thrown provider error — Groq `failed_generation`)
  and `response` (contribute candidate texts — 4o JSONL). Adding a
  quirk changes nothing else.
- A pure byte/value transform is a **repair mechanism** in
  `wire/repair.ts` (extract, escape repair, jsonish decode, truncation
  close). Mechanisms never validate and never know a provider; the
  router composes them.
- Prompt prose exists in **exactly one file**: `transport/protocol.ts`
  (finish protocols, corrections, the bare-schema prompt, the exit-tool
  description). Prompt text anywhere else in signal is a review failure.
- Public contract types live in `types.ts`; module-internal types live
  beside their code. No floating type files.

## Invariants

- **Request immutability.** The request shape (tools, toolChoice,
  responseFormat) never changes during a run. All adaptation is
  response-side. (Learned twice — mid-run tool masking and toolChoice
  pinning both confuse models. Never again.)
- **Repairs are rescue-only.** A repaired candidate counts ONLY when it
  passes the caller's acceptance schema; otherwise the original bytes
  and the original error stand. This is why the ladder safely runs on
  every response of every provider.
- **The router owns classification.** A response is `tool_calls`
  (declared tool), `output` (anything whose repaired value passes the
  acceptance gate — exit-tool args and pseudo-tool args included), or
  `failed` with evidence (+ `attempted` when a parsed candidate existed
  but failed the gate; + `truncated` when bytes end mid-structure).
  Callers switch on the outcome; they never parse strings.
- **Rejections are arrivals.** A provider 400 that carries the model's
  attempt is recovered by an error-hook strategy and routed
  identically: a rejected call to a declared tool IS a tool call; a
  rejected pseudo-call carrying valid output IS output.
- **Transport resolution is pure.** `resolveTransport(spec,
  capabilities)` — previews resolve exactly like runs. `auto` → emit on
  arg-mangling providers (`manglesNestedToolArgs`), native when grammar
  and tools combine, respond otherwise. Explicit choices are honored.
  Permissive respond params on hard-validating providers
  (`validatesToolArgs`) never advertise a field the contract lacks.

## Design decisions (carried from v1 where still true)

1. **Factory function, not class.** Plain object from a closure.
2. **Immutable builder via spread.** Each method forks the config bag.
3. **String provider names**; registry supplies URLs, env keys,
   capability defaults; object config for custom endpoints.
4. **Capabilities drive behavior, not provider identity.** No
   "if groq then X" outside the registry row.
5. **Zod is the source of truth.** Provider grammar is a compliance
   hint; the acceptance schema gates what actually counts.
6. **Zero hard dependencies.** SDKs load dynamically; browsers inject a
   client instead.
7. **History is external.** `complete()` returns full history; callers
   thread it back.
8. **`step()`/`stepStream()` are the primitives; `complete()`/`stream()`
   are wrappers over them.** One pipeline: orchestrators (cortex) and
   the convenience API ride the same wire layer, the same routing, the
   same recovery. Streaming is a delivery mode, never a second system.
9. **Streaming validation is end-of-stream**; mid-stream structural
   parsing is `@niscorp/solid`'s job in the consumer.

## Known debt

- `adapters/anthropic.adapter.ts` and `google.adapter.ts` are stubs
  that throw while the registry advertises both providers — either the
  entries go or the adapters get built.
- The provider SPI types (`ProviderAdapter`, `ProviderRequest`,
  `ProviderStreamDelta`) live in `types.ts`; they belong beside
  `adapters/`.
- `step`/`stepStream` share ~30 lines of routing glue in signal.ts.
- `count()` is a chars/4 heuristic.
