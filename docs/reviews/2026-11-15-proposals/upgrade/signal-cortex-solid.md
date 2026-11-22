# Upgrade notes: signal, cortex, solid

What an app sees after upgrading `@niscorp/signal`, `@niscorp/cortex` and `@niscorp/solid` past the review fixes confirmed by the owner. One section per change an app can see. None of these changes a grammar, a stored document or a table, so there is no migration and no `strata upgrade` to run.

Apps checked: the lab apps in this repo (`apps/lab/*`) and, read only, `AnimaApp`, `anima-finance` and `mira`. All three outside apps are on `@niscorp/signal` 0.1.9 and `@niscorp/cortex` 0.1.6 (which brings `@niscorp/solid` 0.1.3), run Groq through cortex, and use no `onToolResult`, `resumeRun`, `asTool`, `createManifold`, `.apiKey()`, `complete()`, `stream()` or `createStream` of their own.

No lab app had to change. lyceum's `check` passes and relay typechecks as they are. encore's `check` passes everywhere but its scenes-check, which stops on a prism `$join` refusal inside encore's own vex entry `impact/stageDay` (`$join.parts needs items that are text … but item 0 is a list`); that is prism, which these changes do not touch.

---

## signal

### signal — a result says how the reply ended
- Before: `complete()` on a reply the provider cut off (`{"items":["alpha","beta","gam` with finish reason `length`) returned `{ items: ["alpha","beta"] }`, and nothing said the reply had been cut. A `step()` result's `wire` was `{ rung: "close-truncated" }`.
- Now: the same answer, plus `meta.finishReason: "length"`. A `step()` or `stepStream()` result rescued from a cut reply carries `wire: { rung: "close-truncated", truncated: true }`. Every `complete()` and `stream()` result has `meta.finishReason` (the last reply's: `stop`, `length`, `content_filter`, `tool_calls`, …).
- Who notices: code that compares a whole `meta` or `wire` object for equality.
- What to do: nothing. To act on a cut reply, read `meta.finishReason` or `wire.truncated`.
- Breaking: no (new fields).

### signal — refusing a cut-off reply is an opt-in, `refuseCutOff`
- Before: a cut reply whose JSON could be closed was always accepted as far as it was written.
- Now: the same by default. With `createSignal(provider, { refuseCutOff: true })`, `complete()` and `stream()` treat a reply cut off (`length` or `content_filter`) while its JSON was still open as a failed attempt and retry it, sending the model `the reply was cut off (finish reason "length") before its JSON closed. It began: …`. A caller's own loop sets `output.refuseCutOff: true` on `step()` and gets `outcome: { kind: 'failed', truncated: true, evidence }`. A reply that ended with `stop`, or whose JSON closed before the cut prose, is never refused.
- Who notices: nobody until they set the option.
- What to do: nothing. Set `refuseCutOff: true` where cut data must not pass.
- Breaking: no.

### signal — a Groq tool call cut inside its arguments is not run
- Before: Groq rejected a tool call with `tool_use_failed` and its attempt `{"name":"transfer","arguments":{"to":"acct-1","amount":10` (the model was writing 1000). signal closed it and ran `transfer({ to: "acct-1", amount: 10 })`.
- Now: the arguments go on as the text they are, the tool's input check fails, the model is told `error: input_invalid: …` and calls again. An attempt missing only its outer `}` (`{"name":"transfer","arguments":{"to":"acct-1","amount":1000}`) runs as before, with 1000.
- Who notices: any app that runs tools on Groq through signal or cortex (the `failed-generation` strategy is on by default for `'groq'`), in the rare turn where Groq cuts the attempt inside the arguments. That turn now costs one more model call instead of running the tool with cut arguments.
- What to do: nothing.
- Breaking: yes (pending consolidation).
- Affected apps: no code changes anywhere; the turns above behave differently.
  - lab: lyceum (`apps/lab/lyceum/src/server/assistant/orchestrator.ts:21`, `src/server/screens/agent.ts:126`, `src/server/querying.ts:39`), encore (`apps/lab/encore/src/server/agent/llm.ts:43`), relay (`apps/lab/relay/src/server/llm/groq.ts:29`).
  - outside: mira (`src/server/models/index.ts:42`), AnimaApp (`src/server/models/index.ts:17`), anima-finance (`src/server/models/index.ts:14`).

### signal — two tool calls streamed at one index stay two calls
- Before: a provider stream that sent `add {"a":1}` and `mul {"b":2}` both at index 0 gave one call `mul` with the arguments `{"a":1}{"b":2}`, and `tool_call_delta` events `a@0, b@0, c@1`.
- Now: two calls, `add {"a":1}` and `mul {"b":2}`. A piece with a new id at an index another call has starts a new call under the next index no call has: the events are `a@0, b@1, c@2`. A provider that sends one id per index (OpenAI, Groq, OpenRouter, the Responses adapter) sees no change.
- Who notices: code that reads `tool_call_delta.index` from a provider that repeats indices.
- What to do: nothing.
- Breaking: yes (pending consolidation).
- Affected apps: none. No lab or outside app reads `tool_call_delta` itself; cortex follows the `respond` call by these indices and gets the right one.

### signal — with no schema, a rejected reply nothing was recovered from throws
- Before: `createSignal('groq').tools([lookup]).complete('x')`, where Groq rejected a call to an undeclared tool `search_web` with `tool_use_failed`, resolved with `response: ''`.
- Now: it rejects with `SignalError` `E_PROVIDER_ERROR`, message `Provider rejected the reply: provider rejected the attempt (call to unknown tool "search_web") and nothing salvageable remained`, the provider's error in `context.raw`. `stream()` throws the same from its iteration. With a schema nothing changes (the reply is retried, as before).
- Who notices: code that calls `complete()` or `stream()` without `.schema()` on Groq and treats `''` as an answer.
- What to do: catch `E_PROVIDER_ERROR` where an empty answer was handled.
- Breaking: yes (pending consolidation).
- Affected apps: none. No lab or outside app calls signal's `complete()` or `stream()`; cortex uses `stepStream()`.

### signal — `.apiKey()` overrides a custom provider's own key
- Before: `createSignal({ baseUrl, apiKey: 'provider-key', model }).apiKey('override-key')` sent `Authorization: Bearer provider-key`.
- Now: it sends `Bearer override-key`, as DOCS says. Without `.apiKey()`, and for `createSignal(custom, { apiKey })`, the provider's own key is sent as before.
- Who notices: code that calls `.apiKey()` on a custom provider that has its own key.
- What to do: nothing, unless the override was there by mistake: then remove it.
- Breaking: yes (pending consolidation).
- Affected apps: none. No lab or outside app calls `.apiKey()`.

---

## cortex

### cortex — `output.refuseCutOff` on an agent
- Before: an `emit` agent whose reply was cut at `{"data":{"picks":["a","b","c` (finish `length`) returned `ok` with `{ picks: ["a","b"] }`.
- Now: the same by default. With `output: { schema, refuseCutOff: true }` the run corrects the model (a `retry` event of kind `termination` with the evidence) and returns the whole data from the next reply. An older signal ignores the option.
- Who notices: nobody until they set it.
- What to do: nothing.
- Breaking: no.

### cortex — `onToolResult` hooks see a tool's errors
- Before: a tool that threw `connect failed: postgres://admin:hunter2@db.internal/prod` sent that text to the model and to `tool-end`; a redacting hook `(o) => ({ result: '[redacted]' })` was never called for it.
- Now: hooks run after every executed call, also when the tool threw or passed its time limit. On an `error` observation, a hook's `{ result }` replaces the error text: the model gets `error: [redacted]`, and `tool-end` carries `{ kind: 'error', error: '[redacted]' }`. A hook that throws makes the call an error with the hook's message. Hooks still do not run for a denied call, an unknown tool, or arguments that failed the input check.
- Who notices: an app with an `onToolResult` hook that does not check `observation.kind` (it now also rewrites error texts), or one with side effects (counting, logging) that now also run on errors.
- What to do: a hook meant for results only starts with `if (observation.kind !== 'result') return;`.
- Breaking: yes (pending consolidation).
- Affected apps: relay sets a hook (`apps/lab/relay/src/server/functions/ray/trace.ts:92`, used at `src/server/functions/ray/run.ts:81` and `src/dev/ray-mirror.ts:89`); it returns at once unless `observation.kind === 'result'` (`trace.ts:93`), so nothing changes. No other lab app and no outside app sets `onToolResult`.

### cortex — a parent run's handle answers its delegated agent's approval
- Before: a delegated agent (`asTool(child)`, `manifold.asTool(id)`) whose gate asked for approval put `approval-required` on the parent's stream, but `run.approve(id)` on the parent's handle did nothing. The child waited until the delegation's time limit (300 s by default).
- Now: the parent's `run.approve(id)` / `run.deny(id)` with the nested event's id reaches the child, at any depth. The child's own handle (the manifold's `onRun`) still works; the first answer counts. A tool that runs an agent itself passes its handle on with the new optional `ctx.forwardApprovals`:
  ```ts
  const handle = agent.run(input, { onEvent: ctx.forward, agentPath: ctx.agentPath, signal: ctx.signal });
  const stopForwarding = ctx.forwardApprovals?.(handle);
  const result = await handle.result.finally(() => stopForwarding?.());
  ```
  A nested approval still does not survive a reload (the parent's snapshot carries none), and a delegated agent runs under its own gates, not the parent run's `gates`.
- Who notices: an app that answers approvals on the parent handle for events whose `agentPath` is deeper than the parent's.
- What to do: nothing; add the three lines above to a tool that runs an agent itself.
- Breaking: yes (pending consolidation).
- Affected apps: none. No lab or outside app uses `asTool`, `createManifold` or runs an agent inside a tool.

### cortex — a resumed run first runs the calls its last step left unanswered
- Before: a run aborted between two calls of one step (`c1` answered, `c2` not) left a transcript ending `assistant(c1, c2) tool[c1]`. `resumeRun` sent that to the provider (OpenAI answers it with a 400) and `c2` never ran.
- Now: `resumeRun` runs `c2` first, through its gates, approvals and hooks, then calls the model with `… tool[c1] tool[c2]`. A resume from a pending approval is unchanged, and a fresh `agent.run()` given a transcript that ends in a call runs nothing before the model.
- Who notices: an app that resumes snapshots of runs aborted mid-step.
- What to do: nothing.
- Breaking: yes (pending consolidation).
- Affected apps: none. No lab or outside app calls `resumeRun`.

### cortex — `resumeRun` says what is wrong with a snapshot it cannot resume
- Before: a snapshot with no `messages` threw a `TypeError` from `resumeRun`; one whose `pending` had no `remaining` ran and ended `unknown` with `cfg.resumePending.remaining is not iterable`.
- Now: both throw from `resumeRun`: `[cortex:config] snapshot cannot be resumed: pending.remaining: …` (or `messages: …`). Every snapshot that resumed still does, `null` in optional fields included (`pending: null`, `steps: null`).
- Who notices: code that catches the old failures of a broken snapshot.
- What to do: nothing.
- Breaking: yes (pending consolidation).
- Affected apps: none. No lab or outside app calls `resumeRun`.

---

## solid

### solid — a stream ends once
- Before: in `strict` mode, `{"title":"Hi","items":["a"` then `,2]` failed the stream, but `select('items').final()` awaited before the failure never settled, and `select('count').final()` asked after it resolved with the starting value 0. Prose after a valid reply failed a strict stream after `final()` had resolved, so a second `final()` rejected. `{"":{"x":1},"b":2}` resolved `final()` at the inner `}`, without `b`.
- Now: both selections reject with `[solid] stream failed validation`; a selection that resolved before the failure keeps its value. `final()` keeps the value it resolved with. `{"":{"x":1},"b":2}` resolves at the last `}`, with `b`.
- Who notices: strict-mode code that awaits selections, and replies with a root key `""`.
- What to do: handle the rejection of a selection's `final()` in strict mode, as for the root's.
- Breaking: yes (pending consolidation).
- Affected apps: none. No lab or outside app uses solid directly, and cortex never uses `strict`.

### solid — fields that take any value keep their contents; string formats take only strings
- Before: in `recover` and `strict`, everything below `z.any()`, `z.unknown()` or an intersection was refused as `<unknown path>`: `x: z.any()` given `{"x":{"b":[1,2]}}` ended `{ x: {} }` with an error, and a recursive `z.lazy` schema kept nothing. A string-format field (`z.email()`, `z.url()`, `z.uuid()`, `z.iso.*`) took any kind: `{"to":[1]}` for `to: z.email()` gave `{ to: [] }`.
- Now: `{ x: { b: [1, 2] } }` with no error; a recursive schema keeps every level; the fields of a lazy or a pipe are checked against the schema it stands for. `{"to":[1]}` is skipped with an error expecting `string` in `recover`, and fails the stream in `strict`.
- Who notices: (1) a cortex app with `output-partial` listeners whose data schema has `z.record(z.string(), z.unknown())` or similar: cortex's partial stream stopped at the first value nested inside such a field and now goes on to the end of the reply. (2) A strict-mode stream given a non-string for a string-format field.
- What to do: nothing for (1), unless the listener cannot take more partials. For (2), expect the rejection.
- Breaking: yes (pending consolidation), for the strict rejection and for the extra partials.
- Affected apps:
  - mira: `src/server/compose/ask.ts:296` moves the live screen on each `output-partial`. Its reply schema has `input: z.record(z.string(), z.unknown())` on every card (`src/server/compose/reply.schema.ts:32`, `:39`). Measured on that shape with a two-card reply: the partials stopped at the first card's first nested list (16 events) and now run to the end (22 events, both cards whole). Live screens now fill in past the first card's nested input. No code change needed.
  - AnimaApp, anima-finance: no `output-partial` listener; nothing visible.
  - lab: encore listens (`apps/lab/encore/src/server/agent/run.ts:95`); its schema gives 24 and 14 partials per answer, the same before and after.

### solid — no `initial` needed for schemas like `.min(1)`
- Before: `createStream({ schema })` without `initial` threw `[solid] cannot derive valid base…` for a schema with `.min(1)`, `.positive()`, `array().min(1)`, an email, url or uuid format, a `z.record` or a `z.lazy`. A root of `z.any()` or a `.nullable()` object made `write('{…')` throw a `TypeError`. cortex makes its partial stream without `initial`, so an agent with such a data schema emitted no `output-partial` at all.
- Now: the derived starting value is used when every value in it is of a kind the schema takes; constraints are checked when a field finishes. The reply's root becomes the value of a `z.any()` or nullable root. cortex emits `output-partial` events for those agents (their values can fail the schema until the run ends, as partials always could).
- Who notices: a cortex app with `output-partial` listeners and such a data schema; solid code that relied on the construction error.
- What to do: nothing. A listener that cannot take partials filters them, as for any other agent.
- Breaking: yes (pending consolidation), for the new events.
- Affected apps (measured with cortex's partial tracker over the apps' real output schemas):
  - lab relay: the screen-builder's `AnswerSchema` goes from 0 to 27 `output-partial` events per answer; they are forwarded into relay's ray run stream. Nothing reads them today, so nothing shows differently; the run handle keeps the extra events.
  - lab lyceum: the nova layout agent goes from 0 to 20 per answer; nothing reads them.
  - lab encore: 24 and 14, unchanged.
  - outside apps: no listener is affected (see the previous section for mira's).

### solid — a union's field is checked against every variant
- Before: with `w: z.discriminatedUnion('kind', [{ kind: 'text', value: z.string() }, { kind: 'count', value: z.number() }])`, `{"w":{"kind":"count","value":5}}` lost the 5 in `recover` and failed a valid reply in `strict`.
- Now: `{ w: { kind: 'count', value: 5 } }`. A field takes the kinds of every variant that has it and passes finalize if any variant accepts it. Fields typed alike in every variant behave as before.
- Who notices: unions whose variants type one field differently.
- What to do: nothing.
- Breaking: yes (pending consolidation).
- Affected apps: mira's card union (`src/server/compose/reply.schema.ts:43`) types `input` alike in both variants apart from nullishness; its partials are covered by the "any value" section above. No lab app streams such a union.

### solid — only JSON numbers are read as numbers
- Before: `{"a":Infinity,"b":0x1F,"c":+5,"d":.5}` put `Infinity`, 1, 5 and 0.5 into `current()`.
- Now: such text is dropped, with no error, and each field keeps what it had. Valid JSON reads as before at every chunk boundary (`{"price":19.` then `99}` still shows 0, 19, 19.99).
- Who notices: nobody who streams JSON.
- What to do: nothing.
- Breaking: yes (pending consolidation), by the letter: input taken today is refused.
- Affected apps: none.
