# Fix proposals: signal, cortex, solid

**What changed in this revision** (after one independent check):

- **SIG-P1** no longer refuses anything by default.
  - It now ships the finish reason (`meta.finishReason`) and a `wire.truncated` flag, plus a refusal callers opt into (`refuseCutOff`).
  - Which default to use is put to the owner as a policy decision. Nobody has measured how often lab runs go through the rescue.
  - A Groq tool call is refused only when closing the reply would change its arguments. A call missing only its outer `}` runs with 1000 as today; one cut inside its arguments (`amount:10`) is not run.
- **SIG-P3:** a call's new index never collides with a later provider index (a@0, b@1, c@2).
- **SIG-P4:** no longer throws on a Groq call that today's code rescues, because SIG-P1 no longer refuses it.
- **CTX-P2:** relay's visible change is stated, and the item is now a needs-owner-decision item.
- **CTX-P4:** applies only in `resumeRun`. A fresh run whose input ends with a call runs nothing before the model.
- **CTX-P7:** accepts `null` where a field is optional, and checks only what would crash.
- **SOLID-P4/P5:** the "no lab app" claim was wrong. relay's screen builder and lyceum's nova layout go from 0 to 27 and 20 `output-partial` events per answer. SOLID-P4's strict-mode refusal is labelled for a knowing yes.
- **SOLID-P7:** text that can still become a JSON number (`19.`, `-`, `1e`) is read as today. Only text that never can be one is refused.
- The behaviour tests are now in each prototype's test folder and run with the suites.
- The counts and the risk list are updated.

Every item in `open-signal-cortex-solid.md` was checked on `review-fix/all-check` (the fix-all-check worktree, read only, built). Nothing there was changed, built or committed.

The owner's rule for every proposal: "NO BREAKING CHANGES ... everything needs to keep working". Where a fix closes a hole that no legitimate app could rely on, the section says so in a line that starts **Owner to confirm:**, and the owner decides.

## Where the evidence is

Everything below is in `C:\Users\manxx\AppData\Local\Temp\claude\e4f12c79defa0edd\ac8bd814-1c73-419f-964e-fb981acb0ff8\scratchpad\proposals\signal-cortex-solid\`.

- `confirm\`: the third review's scripts, rerun on fix-all-check. Every item marked "proposal" still happens.
- `proto\signal`, `proto\cortex`: copies of fix-all-check's `src` and `test` with the signal and cortex proposals applied.
  - Each has a `test\proposals.test.ts` with the behaviour tests below, run with the suite.
    - signal: 192 of 192 pass (181 existing + 11 new). The signal tests run through the real openai SDK over a fake fetch.
    - cortex: 133 of 133 pass (123 + 10).
    - `tsc --noEmit` is clean on both.
  - `proto\signal-today` and `proto\cortex-today` run the same test files against fix-all-check's `src`.
    - signal: 9 of 11 fail. The 2 that pass are the guards for what must not change: a reply that lost its brace and stopped is still rescued, and a Groq call missing only its outer brace still runs.
    - cortex: 8 of 10 fail. The 2 that pass are guards: a fresh run runs no call from its input, and `null` fields still resume.
- `behaviour\probe1.mjs` is the checker's probe. On the prototypes it now gives: a@0 b@1 c@2; the Groq call with 1000 runs in signal and in cortex; a reply cut every time gives 1 call and ok, as today; a fresh run runs 0 calls; `null` fields resume; no listener leaks.
- `behaviour\signal-cases.mjs` and `behaviour\cortex-cases.mjs` run each proposal's behaviour test through the realistic fake: the real openai SDK 6.33 over a fake SSE fetch (`behaviour\fake.mjs`, the review's `fake.mjs` with a switch).
  - `VARIANT=current` runs fix-all-check's build. `VARIANT=proto` runs the prototypes.
  - Each section quotes both outputs.
- `solid\`: the solid prototypes. `p-all` is every non-breaking solid proposal together. `p-all\test\open-items.test.ts` runs with the suite. It has 18 tests: 17 fail on fix-all-check, plus one guard that a chunk ending inside a number shows what it shows today.
  - solid's suite on `p-all`: 236 of 236 pass (218 existing + 18).
  - 48,000 random runs on the typed schema show 0 differences from fix-all-check.
  - cortex's 123 tests pass with `p-all` as its solid.
- `solid-section.md`: the full solid write-up. The solid sections below are taken from it.

Every package change below carries a `patch` changeset, docs-only changes included.

Sizes are lines of `src` measured on the prototypes, plus an estimate for tests.

"New mechanism" means a new concept, module or public option. It is flagged in each section.

## Table

| # | Item | Proposal | Status |
|---|---|---|---|
| 1 | signal (second review S2): a reply cut off by the length limit is accepted as complete data. `{"total": 12` (cut from 1234) is accepted. `{"items":[1,2,3,4,5,6` with finish `length` returns 6 items with 0 retries. | SIG-P1 | proposal (report + opt-in refusal); the default needs owner decision |
| 2 | signal (third review 1): a cut-off Groq tool call is closed and executed. `transfer({to:"acct-1", amount:10})` runs. | SIG-P1 | proposal; Owner to confirm |
| 3 | signal (third review 2): the repair that closes a cut-off reply is used whatever the finish reason | SIG-P1 | proposal (report + opt-in refusal); the default needs owner decision |
| 4 | signal (third review 4): with no schema, `complete()` returns length-cut text or an empty `content_filter` refusal as a normal answer, and `SignalMeta` has no finish reason | SIG-P1 (additive `meta.finishReason`) | proposal |
| 5 | cortex (third review 6): an emit agent cut off at `…"count":5` returns `ok: true`, and a cut-off `respond` call does too | SIG-P1 (cortex passes `output.refuseCutOff` on) | proposal (opt-in); the default needs owner decision |
| 6 | signal (third review 5): an abort during the SDK's 429 retry-after wait takes the whole wait (8.0 s) | SIG-P2 | proposal (the streaming path; `step()`, `embed()` and `decide()` stay open) |
| 7 | signal (third review 3): parallel tool-call pieces are grouped only by `index`. `add {"a":1}` and `mul {"b":2}` at one index become one call `mul` with `{"a":1}{"b":2}`. | SIG-P3 | proposal; Owner to confirm |
| 8 | signal (second review S3): a Groq `tool_use_failed` on an unknown tool name makes `complete()` succeed with `response: ''` | SIG-P4 | proposal; Owner to confirm |
| 9 | SIGNAL-4: `step()` does not send `reasoningRequest`, and the non-streaming adapter never reads `message.reasoning` | SIG-P5 | proposal for the reading part. Sending the request fields needs owner decision. |
| 10 | signal (second review S3): `.apiKey()` is ignored for a custom provider that has its own key | SIG-P6 | proposal; Owner to confirm |
| 11 | signal (second review C): an unknown custom `wire` id throws a plain `Error`, not a `SignalError` | SIG-P7 | proposal |
| 12 | signal (third review 6): `jsonl-lines` never runs when the first line passes. `{"answer":"draft"}\n{"answer":"final"}` gives draft. | SIG-P8 | needs owner decision (docs now) |
| 13 | signal (second review S3): the documented multi-turn pattern duplicates the system prompt every turn, and the schema's system message goes into history | SIG-P9 (docs) | proposal; the code change needs owner decision |
| 14 | signal (second review S3): `stream()` throws synchronously when the key is missing | SIG-P9 (docs) | proposal |
| 15 | signal DOCS.md has two "### Abort" headings | SIG-P9 (docs) | proposal |
| 16 | SIGNAL-5 (the full fix): an empty argument text stays `''` in `StepResult.toolCalls` and in stream events, and the Responses adapter turns a missing one into `''` | SIG-D1 | needs owner decision (no change proposed) |
| 17 | signal (third review 7): `E_MAX_RETRIES` and three `E_TOOL_*` codes are declared but never thrown; the `anthropic` and `google` adapters are stubs; a custom provider leaves unstated capabilities `false` | — | already fixed (documented). DOCS "Error Handling" names the four codes "not currently thrown". "Known Provider" says the anthropic and google adapters "are not implemented yet". "Custom Provider" says "unstated fields are `false`". |
| 18 | cortex (second review S1, third review 1): `onToolResult` hooks never see errors. A thrown `connect failed: postgres://admin:hunter2@…` reaches the model unredacted. | CTX-P1 | proposal; Owner to confirm |
| 19 | cortex (second review S2, third review 3): a tool timeout does not stop the tool. `send_email` runs twice, and delegated agents keep running after their timeout. | CTX-P2 | needs owner decision (relay's screen builder changes visibly) |
| 20 | cortex (second review S2, third review 2): approvals inside a delegated agent cannot be answered through the parent handle. The child waits forever, and approving it later deleted the file after the parent finished. | CTX-P3 + CTX-P2 | proposal; Owner to confirm |
| 21 | cortex (third review 2, part): the parent's snapshot has no pending approval, so nested approvals do not survive a reload | CTX-P3 (docs) | needs owner decision (a nested snapshot is a new mechanism) |
| 22 | cortex (second review S1): run-level `gates` do not reach delegated child runs | CTX-P3 (docs) | needs owner decision (passing them on changes which calls children may make) |
| 23 | cortex (third review 5): an abort between two calls of one step leaves call c2 with no reply. `resumeRun` sends `assistant(c1,c2) tool[c1]`, and c2 never runs. | CTX-P4 | proposal; Owner to confirm |
| 24 | cortex (second review S3): `output.schema: z.string()` cannot return text that reads as JSON | CTX-P5 | proposal |
| 25 | cortex (second review S3): a run input that is a list of objects with a `role` field is taken as a transcript, and its contents are lost | CTX-P6 | proposal |
| 26 | cortex (second review C): `resumeRun` does not check the snapshot | CTX-P7 | proposal; Owner to confirm |
| 27 | cortex (third review 4): `duration()` is checked only between steps, so a stalled provider stream keeps running past it | CTX-P8 (docs) | proposal (docs); what stays open is stated |
| 28 | cortex (third review 8): under `respond`, an answer written as message text streams no partials | CTX-P8 (docs) | proposal (docs) |
| 29 | cortex (third review 8): the event buffer keeps every event for the life of the handle (about 11 MB for a 375 KB answer) | CTX-P8 (docs) | proposal (docs) |
| 30 | cortex (second review C): wiring errors throw from `agent.run()`, while the README says they throw at definition | CTX-P8 (docs) | proposal (docs) |
| 31 | cortex (second review C): tool `name` is described as "Human-readable", but providers refuse spaces | CTX-P8 | proposal |
| 32 | cortex (second review C): `DEFAULT_AGENT_TOOL_TIMEOUT_MS` is defined twice | CTX-P8 | proposal |
| 33 | cortex (second review C): signal's `corrections.termination` is unused | CTX-P8 (no change) | needs owner decision (using it changes what the model is sent) |
| 34 | CORTEX-5: a model swapped in by `prepareStep` keeps the transport resolved for the run's own llm | — | already fixed (docs: README "prepareStep's `llm` replaces the model…", DESIGN §4). Resolving per step needs owner decision (new mechanism, and the opening messages change). |
| 35 | CORTEX-6: `estimateTokens` duplicates signal's `count()` | CTX-D1 | needs owner decision (no change proposed) |
| 36 | cortex (third review 7): `output-partial` silently stops for schemas with `.min(1)`, email, url, uuid, `.positive()`, `z.record` or `z.lazy`, and a recursive schema gives 0 partials | SOLID-P4 + SOLID-P5 (no cortex change) | proposal; Owner to confirm (relay and lyceum runs gain partials) |
| 37 | SOLID-1: finalization walks every container on each key (2,000 rows: 20.5 s here, 43.6 s in the review) | SOLID-P1 | proposal (the reviewed design; owner yes needed) |
| 38 | SOLID-1 optional part: copy a list with `slice()` in the snapshot | SOLID-P1 | proposal: worth it, as its own commit |
| 39 | solid DESIGN/README claim finalization costs O(events) | SOLID-P1 (docs) | proposal |
| 40 | solid (third review 1): a strict failure leaves a selection's `final()` pending forever, and one asked afterwards resolves to the starting value | SOLID-P2 | proposal; Owner to confirm |
| 41 | solid (third review 2, strict part): prose after the JSON makes `final()` resolve and then reject | SOLID-P2 | proposal |
| 42 | solid, found on the way: a root key `""` whose value is an object ends the stream at that object's `}` | SOLID-P2 | proposal; Owner to confirm |
| 43 | SOLID-4 / solid (third review 2): text after the root value is written into it. `{"total":10}\n{"total":12}` gives `current()` 12 and `final()` 10. | SOLID-P3 | needs owner decision (breaking: solid's own test writes two values into one stream) |
| 44 | solid: `createStream({ schema: z.any() })` with no `initial` | SOLID-P4 + SOLID-P5 | proposal. It has changed since it was filed: in `recover`/`strict` every value is now dropped with an error; it still throws in `trust`. |
| 45 | solid, found on the way: everything inside `z.any()`, `z.unknown()`, `z.lazy()`, a pipe or an intersection is refused as `<unknown path>` | SOLID-P4 | proposal; Owner to confirm |
| 46 | solid, found on the way: `z.email()`, `z.url()`, `z.uuid()` and `z.iso.*` fields are not kind-checked | SOLID-P4 | proposal; Owner to confirm |
| 47 | solid (third review 3): without `initial`, the starting value must pass the whole schema | SOLID-P5 | proposal; Owner to confirm |
| 48 | solid (second review S3): union fields are kind-checked against the first variant only | SOLID-P6 | proposal; Owner to confirm |
| 49 | solid (second review S3): non-JSON values get in: `Infinity`, and `0x1F` read as 1 | SOLID-P7 | proposal; Owner to confirm |
| 50 | solid (third review 4): numbers shown half-read (price 19 before 1999) | SOLID-P8 (docs) | proposal (docs); the code fix needs owner decision |
| 51 | solid (second review C): a selected stream's `write()` and `close()` do nothing | SOLID-P9 (docs) | proposal (docs) |
| 52 | solid: `select()` cannot reach a key with a dot | — | already fixed (documented in README "A path separates keys with dots…" and in DESIGN "Known limitations") |
| 53 | solid (second review C, suspected): `instanceof` checks against solid's own zod copy | — | already fine. zod 4 answers `instanceof` by the schema's kind. A schema from zod 4.3.6 passed to solid built against 4.6.5 behaves correctly (`solid\harness\twozod.mjs`). |

**Counts.**

- 53 rows: 50 open items plus 3 found on the way.
- 28 proposals:
  - signal: SIG-P1 to P9, and SIG-D1.
  - cortex: CTX-P1 to P8, and CTX-D1.
  - solid: SOLID-P1 to P9.
- Statuses:
  - **Already fixed or fine: 4 rows** (17, 34, 52, 53).
  - **Proposal: 41 rows.** 16 of them carry an "Owner to confirm" line.
  - **Needs owner decision: 8 rows** (12, 16, 19, 21, 22, 33, 35, 43).
  - Rows 1, 3, 5, 9 and 13 are proposals with a part that also needs an owner decision: the SIG-P1 default, and the request side of 9 and 13.
- Changes that only touch docs: SIG-P8 (as proposed now), SIG-P9, SOLID-P8, SOLID-P9, and most of CTX-P8.
- New mechanisms: 2, both flagged.
  - SIG-P1's opt-in `refuseCutOff`: a signal config field, a `StepRequest.output` field, and cortex's `output.refuseCutOff`.
  - CTX-P3's optional `ToolContext.forwardApprovals`.
  - The new result fields (`meta.finishReason`, `wire.truncated`, `StepResult.reasoning`) are additive.

---

# signal

## SIG-P1: Say when a reply was cut off; refuse it only when asked, and never run a call whose arguments were cut

**Problem.** The step that closes a cut-off reply runs whatever the finish reason, so a cut-off reply passes as whole data. Examples:

- `{"items":["alpha","beta","gam` with finish `length` returns `{items:["alpha","beta"]}` with 0 retries.
- `{"name":"order","total":12` (cut from 1234) returns total 12.
- A Groq `failed_generation` of `{"name":"transfer","arguments":{"to":"acct-1","amount":10` (it was writing 1000) runs `transfer({to:"acct-1", amount:10})`.

The same root cause makes cortex return `ok: true` on a cut emit or `respond` reply. With no schema, nothing tells the caller the text was cut.

**Root cause.** The router gets the text and never the finish reason. It cannot tell a model that left off its last `}` and stopped (a rescue worth keeping) from a reply the provider cut. The `truncated` flag a rejection carries is set but never read.

**Why not refuse by default.** The check showed that refusing breaks working apps.

- lyceum, encore and relay run gpt-oss-120b on Groq, where the rescue is on by default. A Groq attempt `{"name":"transfer","arguments":{"to":"acct-1","amount":1000}` (arguments whole, only the outer brace missing) runs today. The first version made `complete()` throw and cost cortex an extra call.
- A reply cut every time goes from 1 call and `ok` to 20 calls and `stopped` in cortex, and from 1 call to 3 calls and then `E_VALIDATION_FAILED` in `complete()`.
- Nobody has measured how often lab runs go through this rescue. So which default to use is the owner's policy decision.

**Design.**

1. **Reported, always** (additive).
   - `routeResponse` takes an optional `finishReason`, and `step()`/`stepStream()` pass the provider's.
   - When a reply ended with `length` or `content_filter` while its JSON was still open, and it was rescued anyway, the result's `wire` gets `truncated: true`.
   - `SignalMeta` gets `finishReason?: string`, the finish reason of the run's last step.
   - The Responses adapter already maps `max_output_tokens` to `length`.
2. **Refused, when the caller asks** (opt-in).
   - The options are `createSignal(…, { refuseCutOff: true })` for `complete()` and `stream()`, `StepRequest.output.refuseCutOff` for a caller's own loop, and cortex's `output.refuseCutOff`, which cortex passes on to every step.
   - Such a reply becomes a `failed` step with `truncated: true` and the evidence `the reply was cut off (finish reason "length") before its JSON closed. It began: …`.
   - From there today's code takes over: `complete()` retries with the evidence, and cortex retries as `termination`.
   - A reply that ended with `stop` is never refused. Neither is one whose JSON closed before the cut prose: `{"total":1234}\n\nThe total is the sum of al` gives 1234.
3. **A Groq tool call whose arguments were cut is not run** (always).
   - The failed-generation strategy looks at how deep the attempt is still open.
   - When only the wrapper `{"name", "arguments"}` is open, the arguments are whole and the call runs as today, with 1000.
   - When the arguments themselves had to be closed, they are handed on as the text they are. No tool's input takes that text, so the model is told `input_invalid`, exactly as for a native streaming call cut by the length limit today.
   - No new router rule, no new error, and no extra call beyond the model's own retry.
   - A rejection that is not a tool call (the `json_validate_failed` attempt) is unchanged.

**The policy question for the owner.** Should `refuseCutOff` be the default? A yes changes results for apps whose replies get cut, at the cost above, and the apps that want the old result would set `refuseCutOff: false`. Until that decision, the default is today's behaviour.

**What changes for apps.**

- Parts 1 and 2: nothing. These are new fields and an option nobody sets yet.
- Owner to confirm (part 3): a Groq tool call cut inside its arguments is no longer run with the closed arguments. The model gets `input_invalid` and calls again.
  - No legitimate app can want `transfer` run with 10 when the model was writing 1000.
  - A Groq call missing only its outer brace runs as today, in signal and in cortex (the checker's probe B and B2: executed with 1000, the same number of model calls).
- Lab apps: lyceum, encore and relay get the part-3 change on their Groq tool calls, and nothing else. relay's `build-answer-check.ts` calls `routeResponse` without a finish reason, so its result is unchanged.

**Test** (`proto\signal\test\proposals.test.ts` and `behaviour\signal-cases.mjs`, through the real SDK):

| Case | today | proposal |
|---|---|---|
| `{"items":["alpha","beta","gam` + `length`, default | `{items:[alpha,beta]}`, 1 call | the same, plus `meta.finishReason: "length"` |
| the same with `refuseCutOff: true`, then a whole reply | `{items:[alpha,beta]}` | `{items:[alpha,beta,gamma]}`, retries 1 |
| `step()` on `{"name":"order","total":12` + `length` | `wire: {rung:"close-truncated"}` | `wire: {rung:"close-truncated", truncated:true}` |
| missing brace + `stop`, with `refuseCutOff` | 1234 | 1234 (guard) |
| Groq `transfer` cut at `amount:10` | runs with 10 | not run; the tool result is `error: input_invalid…` |
| Groq `transfer` missing only its outer brace | runs with 1000 | runs with 1000 (guard) |
| cortex emit agent cut, `output.refuseCutOff: true` | `ok`, picks a,b,c | retried (`termination`), then the whole data |
| cortex reply cut every time, default | 1 call, `ok` | 1 call, `ok` (probe1 C) |

**Size.** src about +45 lines.

- `router.ts` +22.
- `failed-generation.ts` +10.
- `repair.ts` +5.
- `signal.ts` +4.
- `run.ts` +3.
- `types.ts` +3.
- `config.ts` +1.
- cortex `define-agent.ts` +1 and `loop.ts` +2.

Tests: 6 signal tests and 1 cortex test, about 70 lines. Docs: DOCS "Meta", "step" and "Custom Provider", about 6 lines; cortex README `output`, 1 line.

**New mechanism. Yes, flagged:** the opt-in `refuseCutOff`, one name in three places (signal config, `StepRequest.output`, cortex `output`). With an older signal, cortex's field is ignored, so cortex can be upgraded alone.

## SIG-P2: An abort ends a stream during the SDK's retry wait

**Problem.** An abort during the openai SDK's 429 retry-after wait waits out the whole wait. The SDK does not watch the signal while it sleeps.

- With retry-after 8, `stream()` ended 8.0 s after the abort.
- A cortex run ended `aborted` after 8.0 s. With retry-after 20, the review's case was still running at 5 s.

**Design.** `executeStepStream` reads the adapter's stream with each `next()` raced against the call's abort signal (`settledOrAborted` in `utils/abort.ts`).

- On abort the stream ends as an aborted stream does today: no `done` and no error.
- The abandoned SDK promise gets a `catch`, so its later rejection is dropped.
- The adapter's iterator is closed on any early exit, which `for await` did before.

Only the streaming path changes. `stream()`, `stepStream()`, `complete()` (built on the stream) and cortex's default transport are covered.

The non-streaming verbs keep waiting. The first prototype raced `unlessAborted` too, and signal's own test `decide() … tears the request down on abort` failed. That test requires an abort during an open request to reject with the provider's own error and its `raw`, and a race would replace it with "The call was aborted".

What stays open: `step()`, `embed()` and `decide()` still wait out an SDK retry-after sleep after an abort.

**What changes for apps.** Nothing but timing: an aborted stream ends at the abort, with the same events. This is not a timeout. It reacts to the caller's own abort.

**Test.** A 429 with retry-after 8, then a whole reply. Abort at 100 ms. `stream()` ends in under 1 s; today it takes 8,011 ms (`P2`). signal's 181 tests pass, the decide abort test included.

**Size.** src +55/−16 (`abort.ts` +21, `execute-step-stream.ts` +34/−16). Tests: about 20 lines.

**New mechanism.** No. It is one internal helper.

## SIG-P3: Parallel tool-call pieces are told apart by id as well as index

**Problem.** Tool-call pieces are grouped only by `index`. Two calls sent at the same index merge: `add {"a":1}` and `mul {"b":2}` give one call `mul` with args `"{\"a\":1}{\"b\":2}"`, and `add` is lost. Whether real providers send this is suspected, not seen.

**Design.** In `execute-step-stream.ts`, a piece that names an id other than the id of the call open at its index starts the next call.

- A new call keeps the provider's index unless an earlier call already took that number. In that case it gets the next number no call uses.
- Pieces `tc(0,a)`, `tc(0,b)`, `tc(1,c)` give `tool_call_delta` a@0, b@1, c@2, and three calls in the `done` result. The first version gave b and c both index 1.
- A piece with no id, or with the same id, continues the open call, as today. Calls stay in arrival order.

**What changes for apps.**

- A stream that sends one id per index (OpenAI, Groq, OpenRouter, the Responses adapter) is unchanged. The ordinary-stream check gives the same calls and indices.
- Owner to confirm: a stream that repeats an index with a new id now gives separate calls instead of one merged call that fails its input check. No app can rely on the merged call, whose arguments are not JSON.

**Test.** The three pieces above. Today: `a@0, b@0, c@1` and the calls `b:mul:"{…}{…}"` and `c:sub`. With the fix: `a@0, b@1, c@2` and the calls `add`, `mul`, `sub` with their own arguments (`proposals.test.ts`, probe1 A).

**Size.** src about +17/−8 in `execute-step-stream.ts`. Tests: about 15 lines.

**New mechanism.** No.

## SIG-P4: With no schema, a rejected reply nothing was recovered from is the provider's error

**Problem.** Groq answers a call to an unknown tool name with `tool_use_failed`. The failed-generation strategy turns it into a `failed` step, and with no schema `complete()` returns `response: ''` as a success.

**Design.** In `run.ts`, with no schema, a step whose outcome is `failed` throws `SignalError` with code `E_PROVIDER_ERROR`.

- The message is `Provider rejected the reply: <evidence>`, and the context is `{ raw }`.
- Only a rejection nothing was recovered from produces that outcome there.
- This is what the same call throws today on a provider without the strategy. There is no new retry and no new prompt text.

**What changes for apps.**

- Owner to confirm: `complete()` and `stream()` without a schema reject with `E_PROVIDER_ERROR` where they resolved `''`. An empty answer to a rejected reply is not one an app can rely on.
- With a schema nothing changes: such a step is already retried.
- With SIG-P1 as revised, a Groq tool call that today's code rescues is still rescued and run, so it never reaches this path. Only a rejection nothing could be recovered from does: a call to an unknown tool, or an attempt that is not a call at all.
- No lab app calls `complete()` or `stream()`.

**Test.** A client whose `create` throws `tool_use_failed` with `failed_generation` `{"name":"search_web",…}` while only `lookup` is declared. Today: `{response: ''}`. With the fix: rejects `E_PROVIDER_ERROR` (`P4`).

**Size.** src +5 in `run.ts`. Tests: about 10 lines.

**New mechanism.** No.

## SIG-P5: `step()` returns the reasoning a provider sends without being asked

**Problem.** `stepStream()` streams reasoning, but `step()` never returns it. The non-streaming adapter does not read `message.reasoning` or `message.reasoning_content`, and `step()` does not send the `reasoningRequest` fields (Groq `reasoning_format: 'parsed'`, OpenRouter `reasoning: {enabled: true}`).

**Design.** Two additive fields:

- `ProviderResponse.reasoning?` and `StepResult.reasoning?: string`.
- The openai-compatible adapter's `chat()` reads `message.reasoning ?? message.reasoning_content`, the same two fields its stream reads.

The request is not changed. Sending `reasoning_format: 'parsed'` from `step()` would move Qwen's `<think>` text out of `content` on Groq. That changes a result `step()` callers read, so it needs an owner decision.

**What changes for apps.** Nothing: one new optional field. lyceum's and relay's step wrappers pass results through whole.

**Test.** A non-streaming reply with `message.reasoning: "2+2 is 4"`. Today `step()` gives `{content:"4"}` and no reasoning. With the fix it also gives `reasoning: "2+2 is 4"` (`P5`).

**Size.** src +7 (the adapter +4, `signal.ts` +1, `types.ts` +2). Tests: about 8 lines. Docs: the `step()` bullet in DOCS (2 lines).

**New mechanism.** No. It is an additive result field.

## SIG-P6: `.apiKey()` overrides a custom provider's own key

**Problem.** For a custom provider that has its own `apiKey`, `.apiKey(k)` does nothing. `resolveProvider` takes `custom.apiKey ?? config.apiKey`, while DOCS says ".apiKey(key) Override the API key".

**Design.** Only the builder method changes. On a custom provider, `.apiKey(k)` writes `k` into the provider's own `apiKey` as well.

- `createSignal(custom, { apiKey })` keeps today's order (the provider's own key first).
- So a caller who passes both at creation sends what it sends today.

**What changes for apps.** Owner to confirm: code that calls `.apiKey(k)` on a custom provider with its own key now sends `k`, as documented, instead of silently sending the provider's key. No lab app calls `.apiKey()`.

**Test.** A global `fetch` stub that records `Authorization`. Calling `createSignal({baseUrl, apiKey:'provider-key', model}).apiKey('override-key').step(…)` sends `Bearer override-key`; today it sends `Bearer provider-key`. Without `.apiKey()` it is still `provider-key` (`P6`).

**Size.** src +2 in `signal.ts`. Tests: about 10 lines.

**New mechanism.** No.

## SIG-P7: An unknown wire id is a `SignalError`

**Problem.** `createSignal({ …, wire: ['no-such'] })` throws a plain `Error`. DOCS says "All errors are `SignalError` instances".

**Design.** `resolveWireStrategies` throws `SignalError` with code `E_VALIDATION_FAILED`, the same message, and context `{ wire: id }`. `E_VALIDATION_FAILED` is the code signal already uses for a config it refuses at build time (an unaccepted `reasoningEffort`).

**What changes for apps.** Nothing for a working app: the creation still throws, with the same message, and it is still an `Error`. Only a misconfigured client is affected: a `catch` that tests `instanceof SignalError` now matches.

**Test.** `createSignal({…, wire:['no-such']})` throws an error with `instanceof SignalError` true and `code` `E_VALIDATION_FAILED`. Today `instanceof SignalError` is false (`P7`).

**Size.** src +2/−1. Tests: 4 lines. Docs: one line in the error table.

**New mechanism.** No.

## SIG-P8: `jsonl-lines` runs after the generic JSON search (needs owner decision)

**Problem.** `jsonl-lines` exists because 4o sometimes writes one JSON object per line, and "the final line is usually the answer". It runs after the generic step that finds JSON inside text, and that step takes the first line. So `{"answer":"draft"}\n{"answer":"final"}` gives `draft`, and the strategy only answers when the first line fails the schema.

**The fix and why it is not proposed for shipping now.** The fix is to run the provider's response strategies before the generic search. It changes which of two answers an OpenAI app gets (`draft` becomes `final`), and both pass the schema. That is a changed output, not a hole, so it needs an owner decision.

**Closest non-breaking form, proposed now.** DOCS gets one line under the provider notes: "On OpenAI, a reply with several JSON values answers with the first that passes the schema; `jsonl-lines` is used only when none does."

What stays open: an OpenAI reply with two passing JSON values answers with the first.

This must agree with solid's SOLID-P3. If the first value stays the answer, P3 makes cortex's last `output-partial` agree with the result. If the owner makes the last line win, P3 should not ship as it stands.

**What changes for apps.** Nothing.

**Test.** If the reorder is approved: `routeResponse` with `jsonl-lines` on `{"answer":"draft"}\n{"answer":"final"}` gives `final` and step `jsonl-lines`. Today it gives `draft` and step `extract` (`confirm\e8.mjs`).

**Size.** Docs: 1 line. With the reorder: src about 4 lines moved in `router.ts`, and 6 lines of test.

**New mechanism.** No.

## SIG-P9: Docs: multi-turn history, `stream()` with no key, the second Abort heading

**Problems, each checked on fix-all-check.**

- Following DOCS "Multi-Turn Conversations" with `.systemPrompt()` and `.schema()` sends, on turn 2: `system(prompt) system(prompt) user system(OUTPUT SCHEMA) assistant user system(OUTPUT SCHEMA)`. The `history` returned already carries the system prompt and the schema message, and the builder adds both again.
- `createSignal('groq').stream('x')` with no key throws `E_MISSING_API_KEY` when `stream()` is called, not when it is read. `complete()` rejects and `stepStream()` throws on its first read.
- DOCS has `### Abort` under Execution and again under Decisions.

**Design (closest non-breaking form).** These are docs only.

- "Multi-Turn Conversations" says that `history` carries the system messages it was sent. The example continues from it with `signal.history(r1.history.filter((m) => m.role !== 'system'))`, so the system prompt and the schema are sent once each turn.
  - Removing the duplicates in code would change the request sent to the provider, so that needs owner decision.
- "`.stream(input, options?)`" says it throws `E_MISSING_API_KEY` (and `E_MISSING_MODEL` for a custom provider) when called, before anything is read.
  - Making it throw on first read would change where an existing `try` catches it.
- The second heading becomes `### Abort a decision`. `.options()` links to `#abort`, which keeps pointing at the first.

**What changes for apps.** Nothing. No lab app calls `.history()`, `complete()` or `stream()`.

**Test.** None: docs only. The duplicated roles above are the evidence (`behaviour\confirm-misc.mjs`).

**Size.** About 10 lines of DOCS, and a changeset.

**New mechanism.** No.

## SIG-D1: SIGNAL-5, an empty argument text (no change proposed)

**Problem.** A call that arrives with no argument text is `args: ''` in `StepResult.toolCalls`, and is sent back as `arguments: ''` on the next turn. signal's and cortex's own loops already read `''` as `{}`, which is the fix that landed.

**Position.** No further change. Turning `''` into `{}` changes a documented output ("the provider's string when it does not parse") and the next request. Nothing shows a provider refusing `arguments: ''`.

Needs owner decision only if one does. What stays open: a caller's own loop sees `''`.

---

# cortex

## CTX-P1: `onToolResult` hooks see a tool's errors too

**Problem.** The hooks run only when a call succeeds. A tool that throws `connect failed: postgres://admin:hunter2@db.internal/prod` sends that text to the provider and to `tool-end`, and a redacting hook is never called.

DESIGN §1 says "Code hooks before and after every tool call", and the hook's own type takes the whole `ToolObservation` union, errors included.

**Design.** In `loop.ts`, the hooks run after `execute` whether it returned or threw, a timeout included.

- On an `error` observation, a hook's `{ result }` replaces the error text: the observation stays `kind: 'error'` with `error: <the result as text>`, and the model is sent `error: <that>`.
- A hook that throws makes the observation an error carrying the hook's message. That is today's rule for a hook that throws on a success, so the original text never goes out.
- Hooks still do not run for `denied` and `unknown-tool`, whose text is cortex's or a gate's own.

**What changes for apps.**

- Owner to confirm: hooks are now also called with `error` observations.
  - A hook that narrows on `kind` sees no difference. relay's hook (`trace.ts`, `if (observation.kind !== 'result' …) return`) is one of these. In TypeScript a hook must narrow before it can read `result`.
  - A hook that returns `{ result }` without looking now replaces error texts too. That is the redaction this item asks for.
  - A hook with side effects (count, log) now also runs on errors.
- No other lab app sets `onToolResult`.

**Test** (`C-P1`). A tool that throws the postgres URL, with the hook `(o) => ({ result: '[redacted]' })`.

| | current | proto |
|---|---|---|
| hook called with | nothing | `error` |
| model is sent | `error: connect failed: postgres://admin:hunter2@…` | `error: [redacted]` |
| `tool-end` | the URL | `error:[redacted]` |

A hook that narrows on kind gives `error: boom` before and after.

**Size.** src about +20/−12 in `loop.ts`. Tests: about 25 lines. Docs: README and DESIGN, 2 lines ("hooks run after every executed call; on an error, `result` replaces the error text").

**New mechanism.** No.

## CTX-P2: A tool's `ctx.signal` aborts when the call times out (needs owner decision)

**Problem.** `withTimeout` only rejects. The model is told "timed out", but the call keeps running. In the review's case:

- `send_email` had a 50 ms limit and a 120 ms body. It was told it timed out twice, retried, and the email was sent twice.
- A delegated agent keeps running after its delegation timed out.

**Design.** Each call gets its own `AbortController`, linked to the run's signal (`linkedAbort` in `utils/timeout.ts`).

- `ctx.signal` is that call's signal. It aborts when the run aborts, as today, and also when the call times out.
- It aborts with no reason, as the run's does, so a tool still sees an `AbortError`.
- The link is removed when the call ends; the checker found no listener left behind.
- `RunCtx.signal` (gates and hooks) stays the run's signal.

`asTool` and `manifold.asTool` already start the child run with `signal: ctx.signal`. So a delegation that times out now aborts its child: the child's pending approval is denied `aborted`.

`DEFAULT_AGENT_TOOL_TIMEOUT_MS`, defined twice, becomes one constant (row 32). That is a separate commit, because it moves code.

**What changes for apps.**

- A tool that ignores `ctx.signal` runs on as today.
- A tool that listens to it stops when its own time limit passes.
- **relay changes visibly, so this needs an owner decision.**
  - relay's `build_screen` tool (`ray/screens/index.ts`, 12-minute limit) passes `ctx.signal` to `buildScreen`, then places the screen with `placeScreen`.
  - Today, a build that passes 12 minutes keeps running, and when it finishes it places the screen on main, after the model was told the tool timed out.
  - With the fix, the build stops at 12 minutes and nothing is placed.
- Owner to confirm, once decided: the general case is a tool still running after it was reported timed out (the email sent twice). The relay case is the same hole seen from the other side: a result the run had already dropped still lands on screen.

**Test** (`C-P2`, `proposals.test.ts`). `send_email` with a 50 ms limit, whose body waits 120 ms on `ctx.signal`, called twice by the model.

- Today: `emailsSent: 2, signalAborted: 0`. With the fix: `emailsSent: 0, signalAborted: 2`.
- A run abort still reaches the tool (`sawAbort: true` in both).

**Size.** src: `timeout.ts` +12, `loop.ts` about +8 (included in CTX-P1's count). Tests: about 25 lines.

**New mechanism.** No. `ToolContext.signal` keeps its type and meaning ("aborts when this call should stop").

## CTX-P3: Delegated runs: an approval is answered from any handle above it

**Problem.** A delegated agent's `approval-required` reaches the parent's stream, as README says nested events do. But `run.approve(id)` on the parent's handle does nothing, because each run has its own approval bridge.

- The child waits until the delegation's 300 s limit, and the parent answers "Done.".
- Approving the child later through the manifold's `onRun` handle deleted the file after the parent had finished.
- The parent's snapshot has no pending approval.
- Separately, the parent's run-level `gates` never reach the child.

**Root cause.** A delegated run is a separate run. The only things it gets from the parent are `signal`, `agentPath` and `onEvent` (`ctx.forward`).

**Design.**

1. The approval bridge gets `forwardTo(child)`. The parent's `approve` and `deny` settle their own ask when the id is theirs, and otherwise pass the answer to every child run registered with it. A child's own `approve` does the same, so the answer reaches any depth.
2. `ToolContext` gets an optional `forwardApprovals(run)`, which returns a function that stops the forwarding.
   - `asTool` and `manifold.asTool` call it with the child's handle and stop when the child's result settles.
   - A tool that runs an agent itself, as README's "A tool that runs an agent itself…" paragraph shows, adds `ctx.forwardApprovals?.(handle)`. README gets that one line.
3. With CTX-P2, a delegation that times out aborts the child. A late approval then does nothing.

**What stays open (docs, needs owner decision):**

- **Nested approvals do not survive a reload.** The parent's snapshot is taken while it runs a tool, not while it asks. Carrying the child's snapshot inside the parent's is a new mechanism.
  - README "Gates and approvals" says: "An approval asked inside a delegated agent is answered through the parent's handle while the parent runs; it does not survive a reload."
- **A run's `gates` guard that run's calls only.** Passing them on would change which calls a child may make, and a gate would run twice under `manifold.asTool`, which already merges the manifold's gates. So it is not proposed.
  - README "Gates and approvals" says: "A delegated agent runs under its own policy and toolGates and, through `manifold.asTool`, the manifold's gates; not the parent run's `gates`."

**What changes for apps.**

- Owner to confirm: `run.approve(id)` / `run.deny(id)` on a parent's handle now answers an approval its delegated agent asked. That is what the README pattern on the parent handle expects, and today it is silently ignored.
- An app that answers through the child's own handle (the manifold's `onRun`) still works: the first answer settles, and a second one is ignored, as today.
- No lab app uses `asTool` or `createManifold`.

**Test** (`C-P3`, real SDK fake, `asTool(child, { timeoutMs: 400 })`, the parent handle approving every `approval-required`):

| | current | proto |
|---|---|---|
| approved through the parent | `deleted: 0`, ends at the 400 ms limit | `deleted: 1`, answered in under 400 ms |
| nobody answers, then the child is approved through its own handle after the parent ended | `deletedAfterLateApproval: 1` | `0` (the child was aborted at the limit) |

**Size.** src +25/−11 (`approval.ts` +22/−10, `as-tool.ts` +2/−1, `define-tool.ts` +1). Tests: about 35 lines. Docs: about 4 README lines.

**New mechanism. Yes, flagged:** an optional `ToolContext.forwardApprovals` member, public through the exported `ToolContext` type.

- It is additive: an app that builds a `ToolContext` itself, in a test, still type-checks.
- The alternative without a public member is a hidden registry keyed by `ctx.forward`, which is worse.

## CTX-P4: A resumed run first runs the calls of its last step that have no answer

**Problem.** An abort between two calls of one step leaves a transcript ending `assistant(c1,c2) tool[c1]`, and a snapshot with no pending approval. `resumeRun` sends that transcript (OpenAI answers such a transcript with a 400), and c2 never runs.

**Design.** Only in `resumeRun`, and only when the snapshot has no pending approval:

- The run reads the end of its transcript. If the last assistant message has tool calls with no `tool` reply after it, those calls go through `processBatch` first: gates, approvals and hooks, as any call does.
- The arguments are read back from the transcript's JSON text.
- A fresh `agent.run()` never does this. The first version did: an input `[user, assistant(toolCalls: charge {amount:5})]` ran `charge` before the first model call.
- The loop gets one internal flag, set by `resumeRun`. The snapshot's shape does not change.

**What changes for apps.**

- Owner to confirm: resuming such a snapshot now runs the unanswered calls before the next model call.
  - With OpenAI the resumed run fails today, so nothing that works changes there.
  - A provider that accepted the gap let the model go on without c2's result. That run now gets it.
- Fresh runs are unchanged: a transcript input ending with a call runs nothing (probe1 D, and a guard test).
- Resumes from a pending approval are unchanged.
- No lab app calls `resumeRun`. encore and atrium read `snapshot().messages`, which is unchanged.

**Test** (`proposals.test.ts`, `C-P4`). A step with calls c1 and c2; c1's tool aborts the run; snapshot, then resume.

- Today: `execs [1]`, and the request is `… assistant(c1,c2) tool[c1]`.
- With the fix: `execs [1,2]`, and the request is `… tool[c1] tool[c2]`.
- Guard: a fresh run with that input runs 0 calls, as today.

**Size.** src about +26 in `loop.ts` and `run.ts`. Tests: about 25 lines.

**New mechanism.** No. It is a rule of resuming, stated in README's resume paragraph (1 line).

## CTX-P5: A string payload is also checked as it was written

**Problem.** With `output.schema: z.string()`, a reply `{"response":"here","data":"[1,2,3]"}` can never pass. The envelope check decodes `data` to `[1,2,3]` before checking it, and then tries an even deeper decode. The run ends `stopped / output_retries`.

**Design.** In `validateEnvelope`, when both decoded tries fail, the schema is tried once more on `data` exactly as written. Decoding still comes first, so a schema that takes the decoded value gets what it gets today. The `string | object` case still decodes to `{a:1}`.

**What changes for apps.** Nothing for an output that passes today. Only a payload refused today is now accepted, when the schema takes it as written.

**Test** (`C-P5`). `z.string()` given `"data":"[1,2,3]"`: today `stopped: output_retries`; with the fix `data: "[1,2,3]"`. `z.union([z.string(), z.object({a})])` given `"{\"a\":1}"` gives `{a:1}` in both.

**Size.** src +5 in `envelope.schema.ts`. Tests: about 10 lines.

**New mechanism.** No.

## CTX-P6: Only messages are taken as a transcript

**Problem.** A run input that is a list of objects each having a string `role` is taken as a transcript. `[{role:'admin',name:'Ann'},{role:'user',name:'Bob'}]` is sent as messages, and today the run ends `model_call_failed: Cannot read properties of undefined (reading 'map')`. The data never reaches the model.

**Design.** An item counts as a message when its `role` is `system`, `user`, `assistant` or `tool` and it has `content` (or `toolCalls`, for an assistant turn written without content). Otherwise the input is sent as JSON, as any other value is. Producers' `Message[]` entries use the same check.

**What changes for apps.**

- Nothing that works today changes.
- Every input reclassified fails today: an unknown role, or a known role with no `content`, which the adapter cannot translate.
- Real transcripts are unchanged: `user:hi, assistant:hello, user:again` gives the same request.

**Test** (`C-P6`). The two rows above: today `model_call_failed`; with the fix one user message whose content is the rows' JSON.

**Size.** src +8/−10 in `assemble.ts`. Tests: about 10 lines.

**New mechanism.** No.

## CTX-P7: `resumeRun` checks what would crash the resumed run

**Problem.** `resumeRun` trusts the snapshot. A stored snapshot missing a part fails in different ways:

- a `TypeError` at `resumeRun` (no `messages`);
- a run that ends `unknown` with `cfg.resumePending.remaining is not iterable`;
- a provider 400.

CHANGING_A_PACKAGE rule 5 says what enters is parsed where it enters.

**Design.** `resumeRun` parses the snapshot with a lenient zod schema of only what makes a resume crash:

- `messages` is a list of objects;
- `pending` is absent, `null`, or has `call {id, toolId}` and a `remaining` list of the same.

Everything else is not checked, because today's code already copes: `steps`, `outputRetries` and `elapsedMs` default to 0, and `usage` and `version` are read loosely. Unknown keys pass. The first version refused `pending: null` and `steps: null`, which resume today.

A snapshot that fails throws `[cortex:config] snapshot cannot be resumed: <issues>`, as the agent-id mismatch already does.

**What changes for apps.** Owner to confirm: a snapshot that cannot run now throws at `resumeRun` with what is wrong, instead of a `TypeError` or a run ending `unknown`. Every snapshot that resumes today still parses: cortex's approval tests, and `null` in optional fields (probe1 E, and a guard test). No lab app calls `resumeRun`.

**Test.**

- A snapshot whose `pending` has no `remaining`: today the result is `unknown: cfg.resumePending.remaining is not iterable`; with the fix it throws `[cortex:config] snapshot cannot be resumed: pending.remaining: …`.
- Guard: `pending: null, steps: null` resumes, as today.

**Size.** src about +12 in `run.ts`. Tests: about 15 lines.

**New mechanism.** No.

## CTX-P8: Docs and small corrections

Each item below was checked on fix-all-check. None changes behaviour.

1. **`duration()` is checked between steps** (row 27). With `duration(200)` and a provider stream that stalls, the run was still going after 3 s.
   - README "stopWhen" says: "Stop conditions are checked before each step; a model call that stalls runs until it ends or the run is aborted. To bound a call's wall-clock time, pass `signal: AbortSignal.timeout(ms)`."
   - Ending a call from inside cortex would either fix a hang with a timer cortex invents (against the owner's rule) or check opaque stop predicates mid-call, which changes when runs stop.
   - What stays open: a stalled stream without an app abort runs on.
2. **Under `respond`, an answer written as text streams no `output-partial`** (row 28). DESIGN §10 already says only `respond` argument pieces stream there. README's events list gets: "Under `respond`, an answer the model writes as message text instead of calling `respond` streams no `output-delta` or `output-partial`; the result is the same."
   - Streaming that text too would turn the prose written beside a `respond` call into output events, and it would end the partials for the real answer.
3. **The event buffer** (row 29). Measured: 23 KB of output kept 3.7 MB, and 94 KB kept 5.3 MB, until the handle was dropped. The buffer is what lets an iterator of `run.events` started late see the whole run (README: `run-start` reaches `run.events`).
   - README says: "`run.events` replays from `run-start` to any iterator, so a handle keeps every event until it is dropped; drop handles you no longer read."
4. **Wiring errors** (row 30). `defineAgent({id, instructions})` with no llm succeeds, and `run()` throws `[cortex:config] agent "a" has no llm`. README "Errors" says: "Programmer errors throw at definition or registration time, or from `run()` when they depend on the run's options: no `llm`, a tool id or name used twice across the agent's and the run's tools, a tool named `respond`."
   - Moving these checks to `defineAgent` would refuse agents that take their llm per run.
5. **Tool name** (row 31). `ToolConfigSchema`'s `name` description becomes "The name the model calls: letters, digits, `_` and `-`, at most 64 characters (what OpenAI-compatible providers accept)."
   - Refusing other names at `defineTool` would refuse definitions accepted today, so it is not proposed.
6. **`DEFAULT_AGENT_TOOL_TIMEOUT_MS`** (row 32): one constant, imported by `manifold.ts`. It moves code and is not exported.
7. **`corrections.termination`** (row 33): not changed. cortex sends `invalidOutput` with the evidence for a termination too. Switching changes what the model is sent, so that needs owner decision. DESIGN §4 gets: "A step that ended with no envelope is corrected with `invalidOutput` and the router's evidence, which says what was missing."

**What changes for apps.** Nothing.

**Test.** None for the docs. For the constant: the existing `asTool` tests.

**Size.** About 12 lines of README/DESIGN, 1 line in the schema, a −2/+1 move for the constant, and a changeset.

**New mechanism.** No.

## CTX-D1: CORTEX-6, `estimateTokens` (no change proposed)

**Problem.** `estimateTokens` is signal's `count()` written again in cortex. It is exported from both packages.

**Position.** No change.

- Using signal's would need a new pure export from signal and a higher `@niscorp/signal` floor in cortex's peer range (`^0.1.9`). That is a step a host must take before upgrading, so it is breaking by the owner's rule.
- `llm.count()` is not an option: `preview()` can run with no `llm`, and an app's own `SignalClient` may count differently.

The cost of leaving it is two copies of a 14-line function. Needs owner decision.

---

# solid

These are the solid sections from `solid-section.md`, shortened. The full text is in that file, with every harness name.

## SOLID-P1: Finalize only each container's direct children (SOLID-1; the reviewed `flat` design)

**Problem.** With `constraints: 'finalize'` or with selections, each new key or list element walks every container seen so far. 2,000 rows `{"rows":[{"id":0,"name":"row 0"},…]}` take 20.5 s here (43.6 s in the review).

**Design.** The reviewed `flat` design, ported onto fix-all-check, keeping that branch's dot-key segments and its collection of listener errors:

- The tracker keeps, per container, its keys in order and how many leading keys are already final.
- A new key or a closing bracket marks only the not-yet-final direct children of that container. A child container was marked when it closed, so the "finalize every descendant" sweep goes.
- The validator remembers how far it has checked each container's keys, so each field is checked once.
- DESIGN "Performance characteristics": "Finalization check" becomes "O(events): each key is finalized once", which is true after this change. "Snapshot" becomes "O(dirty paths × depth), plus the length of each list a write changes".

**The optional list copy: worth it, as its own commit.** The snapshot copies a changed list with `slice()` and visits only the changed indices.

- 20,000 numbers: 246 ms → 117 ms. 2,000 rows: 26 ms → 17 ms.
- +9/−11 lines, and no new mechanism.
- Over 54,700 random runs it is identical to fix-all-check.
- It halves the constant. It does not change the order of the cost.

**Empty-key test.** `{"":{"x":{"y":1}},"b":2,"c":3}` is written one character at a time, with selections `.x`, `.x.y`, `x`, `x.y` and `b`.

- fix-all-check and both prototypes give the identical log: `.x.y=1@16 .x={"y":1}@17 x=undefined@17 x.y=undefined@17 b=undefined@17` (`solid\harness\edge.mjs`, `emptykey.mjs`).
- The random comparison includes root `""` keys.
- That a `""` key ends the stream early is an older defect. P1 leaves it as it is; SOLID-P2 fixes it.

**What changes for apps.** Nothing: the same events, values and order, only faster.

- 218 tests pass.
- 61,900 random runs (`flat`) and 54,700 (`flat` + `slice`) are identical to fix-all-check, on top of the review's ~137k.
- No lab app uses solid directly. cortex's 123 tests pass.

**Test.** 2,000 rows `{id,name}` in 50-character chunks with `constraints: 'finalize'`, then `close()`. It must finish under 1 s with 2,000 rows. Today it takes 22 s; on `p-all` it takes 34 ms.

**Size.** src +49/−51, plus +9/−11 for the copy. About 6 lines of DESIGN. Tests: about 12 lines.

**New mechanism.** No. It is internal state per container.

## SOLID-P2: One end of stream

**Problem.**

- Strict mode: `{"title":"Hi","items":["a"` then `,2]`. `select('items').final()` awaited before the failure never settles, and `select('count').final()` asked after it resolves to 0.
- Prose after a valid reply fails the stream after `final()` resolved, so `final()` resolves and then rejects when asked again.
- `{"":{"x":1},"b":2}` resolves `final()` at the inner `}`.

**Design.** Three small changes:

1. The tracker marks the root final when its count of open containers returns to 0, not at any closing whose path is `""`.
2. A resolved `final()` keeps its value.
3. On a strict failure, the root tells its selections, as it already tells them of errors.
   - An unresolved selection `final()` rejects with the same `[solid] stream failed validation`.
   - It is caught in advance, as `destroy()` does, so nothing becomes an unhandled rejection.
   - One asked later also rejects, unless the root had resolved before the failure.

**What changes for apps.**

- A pending `final()` that never settled now rejects.
- `final()` no longer flips from resolved to rejected.
- Owner to confirm: `select(p).final()` asked after a strict failure now rejects instead of resolving with the frozen value. The root already rejects in that position.
- Owner to confirm: a root key `""` with an object value now gets `final()` at the real end, with every key.
- cortex never uses `strict`. No lab app uses solid directly.

**Test.** The three inputs above. Today: pending and 0; reject on the second ask; early resolve. After: both selections reject; `final()` stays resolved; it resolves with `b` included.

**Size.** src +33/−4. Tests: about 30 lines.

**New mechanism.** No. It adds one internal subscriber set.

## SOLID-P3: Stop reading when the root value closes (SOLID-4), needs owner decision

**Problem.** After the root closes, the parser goes on writing into it.

- `{"total":10}` then `\n{"total":12}` gives `current()` and `on()` 12, but `final()` 10. In one chunk, `final()` is 12.
- In cortex, the last `output-partial` showed 12 while the result was 10.

**Design (the one position).** The parser stops at the character that closes the root, and drops the rest of that chunk and every later chunk. README says: "Text after the root value is not read." It is 6 lines in `incremental-parser.ts`.

**What changes for apps.** This is breaking by the owner's definition.

- A caller who writes two values into one stream now sees only the first.
- solid's own test `validator.test.ts › accepts either type for union` writes `{"d":42}` then `{"d":"text"}` into one stream and expects `"text"`. It would have to be split into two streams.
- No lab app writes two values.
- In cortex, partials then show the first value, which matches signal's answer as long as SIG-P8's reorder is not approved.

The non-breaking parts of this item ship in SOLID-P2. What stays open without a yes: `current()` and `final()` can disagree when a second value follows.

**Test.** Two objects in one chunk and in two: `final()`, `current()` and the last `on()` are all the first object. Today they are 2, 2, 2 in one chunk, and 1, 2, 2 in two.

**Size.** src +6. Tests: about 10 lines, plus the existing test split.

**New mechanism.** No.

## SOLID-P4: What a schema that takes anything takes

**Problem.**

- In `recover` and `strict`, everything inside `z.any()`, `z.unknown()`, `z.lazy()`, a pipe or an intersection is refused as `<unknown path>`. `x: z.any()` given `{"x":{"b":[1,2]}}` ends `{x:{}}` with an error, and a recursive (Nova-style) schema keeps nothing.
- zod 4's string formats (`z.email()`, `z.url()`, `z.uuid()`, `z.iso.*`) are not `ZodString` instances, so they take any kind: `{"to":[1]}` is taken into `to: z.email()`.

**Design.** Three changes in `schema-walker.ts`:

- Stepping into a field reads through a lazy schema, and through a pipe to its input side.
- Below a schema that takes any value, every value is taken. DESIGN already says these are not kind-checked.
- A schema whose zod kind is `string` is checked as a string.

**What changes for apps.**

- Owner to confirm: what is inside any, unknown, lazy, pipe and intersection fields is now kept, with no error. This is what DESIGN and README promise.
- **For a knowing owner yes:** a string-format field now refuses a list, object, number or boolean, as `z.string()` does.
  - In `recover` the value is kept as before and an error is reported.
  - In `strict` a reply with `{"to":5}` for `to: z.email()` now makes `final()` reject, where today it resolves.
  - This refuses input accepted today. The always-valid invariant says it is never written, but a strict-mode app given such a reply would see a rejection.
- P4 ships together with P5 (see P5).
- Lab apps: relay's screen-builder `AnswerSchema` (records of unknown) and lyceum's nova layout (recursive) are affected. The effect is in SOLID-P5.

**Test.** The any, lazy and pipe fields above: `final()` equals the input with no errors (all three fail today). `to: z.email().optional()` given `{"to":[1]}`: `current()` is `{}` and there is one `string` error (today `{to:[]}`).

**Size.** src +18/−3. Tests: about 30 lines. Docs: about 4 DESIGN lines.

**New mechanism.** No.

## SOLID-P5: A starting value without `initial` (also cortex row 36)

**Problem.** Without `initial`, the derived starting value (`''`, `0`, `[]`, or nothing) must pass the whole schema. So `createStream` throws for `.min(1)`, email, url, uuid, `.positive()`, `array().min(1)`, `z.record` and `z.lazy`.

cortex's partial tracker makes its stream without `initial`, catches that throw, and emits no `output-partial` for the whole run. A recursive schema gives 0 partials.

A starting value that is not an object or list (`z.any()`, a `.nullable()` object) makes `write('{…')` throw `TypeError`.

**Design.**

- `resolveBase`: when the derived value fails the schema, it is used anyway if every value in it is of a JSON kind the schema takes at its place. Otherwise it throws as today.
- The parser: when the reply opens the root over a starting value that is not an object or list, it runs the root's kind check and then makes the root.

**What changes for apps.**

- Owner to confirm: `createStream` stops throwing for those schemas.
- cortex then emits `output-partial` events for runs with such a data schema, which had none.
  - Their values can fail the schema until the run ends, as README already says of partials.
  - No cortex change is needed; cortex only needs the newer solid. That is a regular dependency, so there is nothing for a host to do.
- **Lab apps (corrected: the first version said none was affected).** cortex's partial tracker was run over the lab apps' real output schemas (`proposal-check\signal-cortex-solid\solid\lab-partials.mjs`, rerun on the revised `p-all`):
  - relay's screen-builder `AnswerSchema` goes from 0 `output-partial` events per answer today to 27.
  - lyceum's nova layout goes from 0 to 20.
  - relay's screen builder runs inside relay's ray run, so its events are forwarded into the parent run's stream.
  - Nobody reads them today, so nothing shows differently. The cost is the extra events and the memory the run handle keeps for them (CTX-P8 item 3).
  - encore listens to `output-partial`, but its schema already derives cleanly: 24 and 14 partials, the same before and after.
- Schemas whose derived value passes today are untouched.

**Test.**

- The schemas above, with no `initial`, given a whole reply: `final().data` equals the input. Today they throw at construction.
- cortex through the real SDK fake: agents with `title: z.string().min(1)` and with a recursive lazy schema emit at least one `output-partial` whose `data` is the final data. Today they emit 0 (`confirm\e13.mjs`). Rebuilt over `p-all`, they emit 5–11 each (`solid\harness\partials.mjs`).

**Size.** src +38/−4. Tests: about 25 lines.

**New mechanism.** No.

## SOLID-P6: A union's field is checked against every variant that has it

**Problem.** `discriminatedUnion('kind', [{kind:'text', value: string}, {kind:'count', value: number}])` given `{"w":{"kind":"count","value":5}}`: `recover` drops the 5, and `strict` fails a valid reply.

**Design.** Stepping into a union steps into each variant that has the segment. The field takes the kinds of all of them, and passes at finalize if any variant accepts it.

**What changes for apps.** Owner to confirm: a union field now keeps a value that a later variant allows. Fields typed alike in every variant behave as today. No lab app uses solid directly. Through cortex, a union inside lyceum's nova layout gets partials only once SOLID-P5 lets that schema stream at all, so P6 decides what those new partials keep, not something shown today.

**Test.** That union in strict mode: `final()` resolves to `{w:{kind:'count', value:5}}`. Today it rejects.

**Size.** src +27/−24. Tests: about 10 lines.

**New mechanism.** No.

## SOLID-P7: A literal that can never be JSON is not read as a number

**Problem.** Literals are read with `Number()`. `{"a":Infinity,"b":0x1F,"c":+5,"d":.5}` puts `Infinity`, 31, 5 and 0.5 into `current()`.

**Design.** `parseLiteral` keeps `true`, `false`, `null` and `Number()` as today.

- It first refuses text that can never become a JSON number, whatever comes next (the pattern `-?(0|[1-9][0-9]*)(\.[0-9]*)?([eE][+-]?[0-9]*)?`, or a lone `-`). That refuses `Infinity`, hex, a leading `+` and a leading `.`.
- Text that can still become a JSON number is read exactly as today. A chunk can end inside a number: `{"price":19.` then `99}` still shows 0, 19, 19.99.
- The first version read literals with `JSON.parse`. It dropped `19.`, so `on()` showed 0, 19.99, which is a change for valid JSON. It also decided SOLID-P8 by the back door.
- There is no new error phase, because `StreamErrorPhase` is an exported union type.

**What changes for apps.**

- Owner to confirm: those non-JSON literals are no longer taken. This refuses input accepted today, but no JSON producer sends it, and the values taken today are not what was written.
- Valid JSON is untouched, at every chunk boundary. The checker's `literals.mjs` was run on fix-all-check and on `p-all`. Chunks `19.`+`99`, `-`+`5`, `1e`+`3`, `1.5e-`+`2` and `0.`+`5` give identical `on()` values, the same `final()` and the same errors, in all three modes.

**Test.**

- The input above against four `z.number()` fields starting at 0: `current()` stays all 0.
- Guard: `{"price":19.` + `99}` shows `[0, 19, 19.99]`, `-` + `5` shows `[0, -5]` and `1e` + `3` shows `[0, 1000]`, as today.

**Size.** src about +8/−6. Tests: about 18 lines.

**New mechanism.** No.

## SOLID-P8: Numbers shown as read so far: docs

**Problem.** With `{"price":19` then `99,…}`, `on()` sees 19 before 1999. README documents this only for strings.

**Design (closest non-breaking form).** README and DESIGN §4 say: "A number is shown as read so far, as a string is."

What stays open: a UI can show a wrong intermediate number. The code fix was prototyped and fails solid's own test `streams array elements incrementally`, so it needs owner decision.

**What changes for apps.** Nothing.

**Test.** None.

**Size.** 2 lines of docs.

**New mechanism.** No.

## SOLID-P9: A selection's `write()` and `close()`: docs

**Problem.** `stream.select('title').write('{"title":"x"}')` does nothing, and that selection's `final()` stays pending.

**Design.** README says: "A selection's `write()` and `close()` do nothing: feed the root." Making them throw or forward would change what a call does today.

**What changes for apps.** Nothing.

**Test.** None.

**Size.** 1–2 lines of docs.

**New mechanism.** No.

---

# The three proposals with the most risk

1. **SOLID-P4 + SOLID-P5: fields that take any value, and a starting value without `initial`.**
   - relay's screen builder and lyceum's nova layout go from 0 to 27 and 20 `output-partial` events per answer, forwarded into relay's parent run. Nobody reads them yet; the cost is events and memory.
   - Those partial values can fail the schema mid-run.
   - In `strict`, a string-format field given a number now makes `final()` reject. That part is labelled for a knowing owner yes.
2. **CTX-P2: a tool's `ctx.signal` aborts at its time limit.**
   - It changes what relay's users see: a screen build that passes its 12-minute limit no longer appears on main afterwards.
   - It is marked needs owner decision.
3. **CTX-P1: `onToolResult` hooks are called on errors.**
   - Every app with a hook sees new calls. A hook that does not check `kind` now rewrites error text, and a hook with side effects runs on errors too.
   - It is what closes the redaction hole. relay's hook checks `kind` and is unaffected.

SIG-P1 is no longer among them. By default it only adds a report, and its one behaviour change refuses a Groq tool call whose arguments were cut inside. Whether to refuse cut replies by default is the owner's policy decision.

SOLID-P3 (stop reading at the root's close) stays the one item that is breaking by the owner's definition. It needs owner decision.
