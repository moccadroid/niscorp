# Cortex — build plan (internal)

**Audience:** us. Not shipped, not linked from the showroom, not
published. Lives in the repo so the phased plan and reality-contact
criteria don't get lost. Keep this file out of the showroom `docs`
array in `apps/showroom/src/modules/cortex/index.ts`.

Everything in this file is project-process content. External-readable
rationale belongs in `DESIGN.md`. End-user instructions belong in
`README.md`.

---

## Phased build plan

Each phase ends with something usable.

### Phase A — Substrate (unblocks Vex and Prism agents) — **done**

- Schemas: `ActionPlanSchema` (deferred validation), `AgentConfigSchema`, `ToolConfigSchema`, `ObservationSchema`, `ContentChunkSchema`. All with `.describe()`.
- Manifold skeleton: registry, bus (wildcard subs, `waitFor`, `dispatch`, correlation ids), in-memory ledger, in-memory state store, in-memory event log, lifecycle (`start`/`stop`/`drain`).
- `defineTool`, `defineAgent` for `text` and `structured` modes.
- Context pipeline: types, gather/build/estimate/compress/pack, `previewContext`.
- Built-in producers: `system`, `tools`, `input`, `history`, `budget`.
- `truncate` compressor.
- Token estimation: fuzzy mode by default. Exact mode hooked up to `signal.count()`.
- Cortex tool loop on top of `signal.step()`.
- Agent execution path (single function, used by both standalone and manifold).
- `runAgentStandalone` helper.
- Error model implemented end-to-end.

**Reality contact:** scratch agent + Vex query agent + Prism mapping agent in the showroom, running against a real model.

### Phase B — Planning — **done**

- ActionPlan plan-mode in `defineAgent`.
- Plan executor: depth-first, gate per node, observation per step.
- Tick loop integrated into plan-mode execution.
- `ask_agent` (sync sugar over the bus, with in-process short-circuit for specialists).
- `tell_topic` + `wait` + `parallel`.
- Policy gate: tool allow/deny, risk levels, budget enforcement.
- Built-in producers: `actionContract`, `agents`, `observations`.

**Reality contact:** multi-agent director demo in the showroom.

### Phase C — Steering — **done (shape changed)**

Originally scoped as: stateful context producers via `subscribes` + a hook-based interceptor system (`beforePlan`, `afterStep`, …) + `defineBehavior` convenience.

What shipped: stateful producers (as designed) **and a declarative rules engine** (`defineRule`, conditions, accumulators, effects) in place of the hook-based system. `defineBehavior` was not built — the rules DSL covered the real cases without it.

- Stateful producers via `subscribes` + `onEvent`.
- Rules engine: accumulators (`count` / `sum` / `latest`), condition DSL (`$eq`/`$gte`/`$and`/...), effects (`inject` / `abort` / `deny` / `call`).
- Named effect registry (`call` effect escape hatch).
- Async confirmation flow (bus-driven: `cortex.policy.confirmation.requested` / `approved` / `denied`).
- Output-validation retry loop with `cortex.agent.retry` event for observability.
- `recitation` producer (Manus pattern).
- `summarize` compressor (opt-in, with configurable small/fast model).

**Reality contact:** rate-limit, support-escalation, fact-budget, db-compound, multi-rule, research-desk, quick-research stories; approve/deny confirmation stories.

### Phase D — Production hardening — **next**

Goal: deployable.

- Durable `StateStore` and `EventLog` adapters (Postgres reference implementation).
- Drain semantics polished.
- Metrics hooks (`onObservation`, `onWorkflowEnd`).
- KV-cache stability optimizations: explore logit masking via Signal `tool_choice`.
- `signal.count()` exact-mode integration polish with a real tokenizer.
- Optional dollar accounting via user-supplied per-model price maps.
- Streaming API (the reserved shape from `DESIGN.md` §13) — only after the partial-JSON library has landed.
- `MemoryStore` interface export + reference implementations (deferred from v1; worth revisiting now that the rest is stable).

---

## How we know we're on the right track

Three layers of signal. Need all three.

### Layer 1 — Tests (correctness)

Catches "the code does what the design says." Cortex is unusually testable because most of it is pure functions. The pipeline and the tool loop carry the bulk of the test suite. Standalone-vs-manifold parity tests validate the "one execution path" claim.

### Layer 2 — Integration with the rest of the stack (fit)

Catches "the abstractions are wrong." If defining the Vex query agent in `@niscorp/vex/agent` requires Cortex changes, that's a design signal. Resolve every "I wish Cortex did X" explicitly: either Cortex really should do X, or Vex is approaching the problem wrong, or the abstraction is at the wrong level. Write the resolutions down.

### Layer 3 — The showroom and a real model (truth)

Catches "the design works in theory but not under contact with a live LLM." **This must happen at the end of every phase, not at the end of the project.** If a phase's showroom test doesn't work reliably against a real model, that phase is not done, regardless of how green the unit tests are.

The scratch canary (`examples/scratch.ts`) is the five-minute recurring check: trivial agent, six scenarios (text, structured, tool, Prism mapping, plan mode, multi-agent delegation). Every change to Cortex re-runs it. If it breaks or feels worse, stop and investigate.

---

## Notes for future-us

- If `defineBehavior` comes back, it's a convenience that bundles rules + producers with shared state. Nothing more.
- `MemoryStore` as a `ContextProducer` + pluggable store is the right shape. Don't build a parallel memory subsystem.
- Before adding new bus topics, extend the typed taxonomy in `topics.ts` — don't leave topics as free-form strings with `unknown` payloads.
- Phased plan lives HERE, not in `DESIGN.md`. If the plan changes, update this file.
