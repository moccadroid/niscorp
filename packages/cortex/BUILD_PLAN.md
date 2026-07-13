# Cortex v2 — build plan (internal)

**Audience:** us. Not shipped, not linked from the showroom. Rationale
lives in [`DESIGN.md`](./DESIGN.md); end-user instructions belong in
`README.md`.

## Verification (2026-07-10)

Cleanup + install + full `pnpm -r build && typecheck && test` ran green:
0 typecheck errors, 1,305 tests passing across solid/signal/cortex/prism/
nova/vex/loom, relay + showroom build. `ray-check` (headless, no LLM)
passes end-to-end. Still pending, keys needed: `architect-check` and the
manual showroom demo gallery — every LLM interaction needs a live pass.

## Status

- [x] **S0 Signal** — `stepStream` emits `tool_call_delta`; `StepRequest.responseFormat`
      + `toolChoice: 'required'` wired through adapter; capabilities truthed
      (Groq `nativeTools: true`, new `toolsWithStructuredOutput`); custom-provider
      capabilities respected; `describe()` added (provider/model/caps, no network);
      tests extended (step-stream deltas + passthrough, registry).
- [x] **S1 Gut** — v1 subsystems queued for deletion in `V2_CLEANUP.sh`
      (bus/topics, rules, plan mode, producers/compressors/tokens, stores,
      ledger/registry/lifecycle, tool-loop, llm shim, old tests).
- [x] **S2 Core types** — envelope (+ hand-rolled validation, typed end-to-end),
      `RunResult`/`RunMeta`/`CortexError`, `CortexEvent` vocabulary,
      `ToolObservation` union. Trust boundary consolidated in `utils/trust.ts`.
- [x] **S3 Context** — `ContextEntry` with typed deps, `assembleContext`,
      `inputMessages` (string | Message[] | JSON), `schemaDoc`, `preview`.
- [x] **S4 Loop + respond** — always-streaming loop, append-only transcript,
      sequential gated calls, respond synthesis (full/loose params + auto
      schema-doc injection), in-loop corrections (validation, termination,
      respond-alone), `output.validate`, `stopWhen` built-ins.
- [x] **S5 Gates/approvals** — gate chain with arg rewrite, policy sugar,
      approval suspend (register-before-emit, abort-aware), approve-with-edits,
      timeout→denial, `snapshot()`/`resumeRun` with JSON round-trip.
- [x] **S6 Events + solid** — per-run channel (listeners + buffered
      AsyncIterable), child-event forwarding, `output-delta`/`output-partial`
      via solid (best-effort, retry-reset).
- [x] **S7 Strategies** — `native` (response_format, capability+compat gated),
      `emit` (fence-tolerant, opt-in), `auto` resolution + strict-compat walk.
- [x] **S8 Manifold** — catalog + defaults + `onRun` tap, `asTool` (typed and
      erased) with envelope→result mapping and nested agentPath.
- [x] **Tests** — envelope, strategy-resolve, define, loop, gates, approval
      (incl. snapshot/resume), streaming (respond args + text strategy),
      composition (manifold, asTool, forwarding), channel. Scripted
      `SignalClient` stub in `test/helpers/stub-signal.ts`.
- [x] **S9 vex** — deps kill the per-request agent rebuild; `cannotSatisfy`
      via event-watch + abort (rules/producers deleted); per-run `tools`.
- [x] **S9 prism/nova** — payload IS the Config/LayoutNode (envelope
      `reasoning` replaces the wrapper); hand-embedded schemas removed
      (auto `schemaDoc`).
- [x] **S9 relay** — ray: transcript as `Message[]` input, shell via deps,
      event-driven trace (trace.ts rewritten, no tool wrapping), Traced
      envelope as an `onToolResult` hook, query/visualize behind a
      `dataTools` flag; architect: harness verification moved INTO the run
      (`output.validate`), env via deps, `map` kept but not handed to the
      builder, event trace lines; both dev checks updated to v2.
- [x] **S9 showroom** — rebuilt as a compact v2 module (the old one demoed
      deleted subsystems): a shared RunPanel (event timeline + streamed
      `output-partial` + approval buttons + result/meta) driving six
      stories — chat envelope, structured extraction, preview (keyless),
      tool loop, gates+approval, asTool nesting. Keys come from
      Signal → Settings; demos are a manual gallery (need a live model).
- [x] **S10 docs** — README rewritten (external, v2 surface); DESIGN synced
      with implementation (error codes, per-run tools/hooks, timeout→denial);
      vex DOCS updated; signal DESIGN registry table updated.
- [ ] **S10 scratch canary** — `examples/scratch.ts` never existed on disk;
      write a v2 canary (chat, extractor, tool agent, big-DSL agent,
      approval flow, streaming) once live keys are at hand.

## Open follow-ups (post-verification)

- `respond` vs `emit` A/B on the big-DSL agents (prism mapping, nova
  layout, architect) — record the outcome in DESIGN §15.
- `output.forceTool` (`toolChoice: 'required'`) — measure on Groq 120b
  before making it a default anywhere.
- Solid partial-tracking on the recursive wire schemas — if solid's
  kind-checks fight the big unions, partials silently stop (by design);
  check whether `output-partial` fires for the architect.
- Showroom v2 demo module (above).
