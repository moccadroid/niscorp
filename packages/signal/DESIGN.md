# Signal — Design Document

Architecture, design decisions, and trade-offs behind `@niscorp/signal`.
For usage documentation, see [DOCS.md](./DOCS.md).

One sentence: **what comes out conforms to the schema that went in, on
every provider — or you get a typed failure with evidence.**

---

## The layer map

```
types.ts       the public contract (incl. StepOutcome / Rejection / WireReport)
registry.ts    provider DATA (baseUrl, endpoint capabilities, adapter id, wire strategy ids)
               + model DATA (model capabilities, reasoning efforts) — measured rows
scripts/       probe-model.ts: measures one model on one provider, prints its registry row
adapters/      byte movers, one per WIRE PROTOCOL (not per vendor) — throw-and-wrap, zero policy
decide/        gate.ts: the acceptance gate DERIVED from a decide() call's questions
wire/          RESPONSE side: repair.ts (mechanisms) → router.ts (classify) → strategies/ (provider quirks)
transport/     REQUEST side: resolve.ts (respond | native | emit) + protocol.ts (ALL prompt prose)
signal.ts      the client: step/stepStream = the ONE execution core, builders, embed, decide, count
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
  capabilities)` — previews resolve exactly like runs. `auto` picks what
  ENFORCES: native when grammar is viable; respond when its tool params
  can enforce the contract (the endpoint does not validate tool args
  itself, the full schema fits, the model does not mangle nested args —
  or `forceTool`); emit otherwise, because every model can do it and
  the contract rides the prompt either way. Explicit choices are
  honored. Permissive respond params on hard-validating providers
  (`validatesToolArgs`) never advertise a field the contract lacks.
- **A capability is owned by the endpoint or by the model, never both.**
  `EndpointCapabilities` live on the provider row, `ModelCapabilities`
  on a model row keyed `provider/model`; a client's capabilities are
  the join. Model rows are pasted from `scripts/probe-model.ts`, carry
  the day they were measured, and are the only place a model fact
  lives — no instance override, no app-side table. The invariants are
  `test/registry.test.ts`.

## Design decisions (carried from v1 where still true)

1. **Factory function, not class.** Plain object from a closure.
2. **Immutable builder via spread.** Each method forks the config bag.
3. **String provider names**; registry supplies URLs, env keys,
   endpoint and model capabilities; object config for custom endpoints.
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
10. **An adapter is one of two kinds, and the kind is the capability.**
    `ChatAdapter | DecisionAdapter`, discriminated by `kind`, and the
    registry row and the custom-provider config split the same way. A
    decision model has no chat endpoint, so a decision adapter carrying a
    `chat` that throws would be an adapter lying about what it is. There
    is deliberately no `supportsDecisions` flag: a flag beside the kind is
    a second truth that can disagree with the first. `describe().kind`
    answers without the network.
11. **`decide()` sits beside the execution core, not in it.** Like
    `embed`: one request, one response, no history, tools or loop — none
    of the wire layer applies, because a decision model writes no bytes
    to repair. The questions are the schema: the result type and the
    gate (`decide/gate.ts`) both derive from them, which is the package's
    one sentence applied to a model that answers instead of writing.
12. **Emulation is honest or absent.** On a chat adapter `decide()`
    runs the derived schema through `complete()` and returns picks with
    `calibrated: false` — the discriminant of `DecideResult`, so the
    probabilities do not exist in the type on that branch. A fabricated
    `1.0` would clear every caller's threshold. Same rule as
    `usage.reported`.

## Known debt

- `adapters/anthropic.adapter.ts` and `google.adapter.ts` are stubs
  that throw while the registry advertises both providers — either the
  entries go or the adapters get built.
- The provider SPI types (`ProviderAdapter`, `ProviderRequest`,
  `ProviderStreamDelta`) live in `types.ts`; they belong beside
  `adapters/`.
- `step`/`stepStream` share ~30 lines of routing glue in signal.ts.
- `count()` is a chars/4 heuristic.
