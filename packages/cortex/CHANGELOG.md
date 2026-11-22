# @niscorp/cortex

## 0.2.0

### Minor Changes

- 48138de: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app has an `onToolResult` hook that does not check `observation.kind` and relied on it running for successful calls only.

  `onToolResult` hooks now run after every executed tool call, also when the tool threw or passed its time limit; before, they ran only when it returned. On an `error` observation a hook's `{ result }` replaces the error text that goes to the model and to `tool-end`: a tool that throws `connect failed: postgres://admin:hunter2@…` reached the model as written, and with a redacting hook `(o) => ({ result: '[redacted]' })` it now reaches it as `error: [redacted]`. A hook that throws makes the call an error carrying the hook's message, as for a result. A hook that returns early unless `observation.kind === 'result'` sees no difference. Hooks still do not run for a denied call, an unknown tool, or arguments that failed the input check.

- da3037e: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app listens to `output-partial` and relied on an agent with such a data schema sending none, or fewer.

  More agents stream `output-partial` events, through the newer `@niscorp/solid` cortex uses for them. An agent whose data schema has a field with a constraint (`.min(1)`, `.positive()`, an email or url format), a `z.record` or a `z.lazy` (a recursive schema) emitted no `output-partial` for the whole run, and now emits them as the reply arrives. One with a field that takes any value (`z.record(z.string(), z.unknown())`, `z.any()`) stopped emitting at the first value nested inside that field, and now goes on to the end of the reply. A union field whose value only a later variant takes is kept in the partials instead of dropped. As before, a partial's value can fail the schema until the run ends, and the run's result is checked as before. Measured over real app schemas: a screen builder goes from 0 to 27 events per answer and a nova layout from 0 to 20; a run handle keeps the extra events until it is dropped.

- e957628: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on `run.approve` or `run.deny` on a parent run's handle doing nothing for an approval its delegated agent asked.

  An approval asked inside a delegated agent (`asTool`, `manifold.asTool`) is now answered through the parent run's handle: `run.approve(id)` or `run.deny(id)` with the id of the nested `approval-required` event reaches the child, at any depth. Before, it was ignored, and the child waited until the delegation's time limit. An answer through the child's own handle (the manifold's `onRun`) works as before; the first answer counts.

  `ToolContext` has a new optional member, `forwardApprovals(handle)`, for a tool that runs an agent itself: it passes the parent's answers on to that run and returns a function that stops it. The README shows the three lines. The parent's snapshot carries no nested approval, so a nested approval does not survive a reload; a delegated agent runs under its own policy and gates, not the parent run's `gates`. The README now says both.

- efd2368: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app passes `resumeRun` a snapshot it cannot resume and relied on how that failed.

  `resumeRun` now checks the parts of a snapshot a resumed run cannot do without, and throws `[cortex:config] snapshot cannot be resumed: <what is wrong>` when one is missing: a `messages` list, and a `pending` with its `call` and `remaining` list. Before, such a snapshot failed in different ways: a `TypeError` from `resumeRun` with no `messages`, or a run ending `unknown` with `cfg.resumePending.remaining is not iterable`. Every snapshot that resumed still does, `null` in its optional fields included (`pending: null`, `steps: null`).

- ca26810: BREAKING — approved by moccadroid (owner), 2026-11-22: an app that takes `run.snapshot()` while a tool is running (from inside the tool, or from an event before its `tool-end`) and resumes that snapshot now runs that call a second time. Take the snapshot after the call's `tool-end`, or make the tool safe to run twice. Nothing else changes unless an app relied on a call left without an answer never running.

  `resumeRun` now first runs the calls of the snapshot's last step that no tool message answers, through their gates, approvals and hooks, before it calls the model. A run aborted between two calls of one step (`c1` answered, `c2` not) left a transcript ending `assistant(c1, c2) tool[c1]`: resumed, it sent that to the provider and `c2` never ran: OpenAI refuses such a transcript, and Groq takes it (200) and the model goes on without `c2`'s result. Now `c2` runs and the model is sent `tool[c1] tool[c2]`. Any call of that step with no tool message runs, so a call that was still running when the snapshot was taken (a `pay` that calls `run.snapshot()` while it executes) runs again on resume. A resume from a pending approval is unchanged, and a fresh `agent.run()` given a transcript that ends in a call runs nothing before the model, as before.

- 322f241: BREAKING — approved by moccadroid (owner), 2026-11-22: a tool or delegated agent that hands `ctx.signal` to work meant to outlive its time limit sets a longer `timeoutMs`, or gives that work a signal of its own.

  A tool call that passes its time limit (`timeoutMs`) now has its `ctx.signal` aborted, with an `AbortError` as when the run is aborted. A tool that hands `ctx.signal` to its work stops there, instead of running on after the model was told it timed out: a `send_email` that timed out and was called again sent the email twice before, and sends it once now. A tool that ignores `ctx.signal` runs on as before.

  A delegated agent (`asTool`, `manifold.asTool`) runs on the delegating call's signal, so it now stops at the delegation's time limit instead of finishing after the parent has moved on.

  Each tool call gets its own `ctx.signal`. It aborts with the run while the call runs; once the call has ended, a later abort of the run no longer reaches it. Gates and `onToolResult` hooks are still handed the run's signal.

### Patch Changes

- c30562a: `output.refuseCutOff: true` on an agent refuses a reply the provider cut off (finish reason `length` or `content_filter`) while its JSON was still open, and an attempt a Groq rejection (`failed_generation`) carried cut short: the run corrects the model as for a reply with no envelope (a `retry` of kind `termination`, or `provider` for a rejection) instead of accepting the reply closed at its last whole value. Without the option nothing changes. It is passed on to signal's `output.refuseCutOff`; a signal without that option ignores it.
- 800a541: A run with `transport: 'step'` that is aborted during the model call now ends with `code: 'aborted'` instead of returning the model's answer, and the call is handed the run's abort signal.

  Two readers iterating `run.events` at the same time (for example the manifold's `onRun` tracer and the app's own loop) now both get every event and both end; before, one of them could wait forever.

  An approval answered (or a run aborted) before `policy.approvalTimeoutMs` runs out no longer leaves its timer running, so a process does not stay alive until the timeout.

  A correction sent back to the model quotes the issues word for word: `$$`, `$&` and `$'` in them were rewritten before.

  The README's quick example no longer runs model-written text with `new Function`, and the docs say that a model swapped in by `prepareStep` is sent the output strategy resolved for the run's own `llm`.

  A tool that takes no arguments now runs when its call arrives with no argument text, instead of failing with "arguments arrived as ONE STRING".

- 9c5367b: An agent whose `output.schema` takes only strings (`z.string()`, with or without checks such as `.min()`) now gets a `data` that reads as JSON as the model wrote it (`"[1,2,3]"`); before, the run ended `stopped` after its output retries. A schema that also takes any other kind of value is handled as before.

  The README says that stop conditions are checked between steps and how to bound a call's time, that under `respond` an answer written as text streams no partials, that a run handle keeps every event until it is dropped, and which wiring errors `run()` throws. DESIGN says how a step with no envelope is corrected. A tool's `name` is described as the name the model calls. The agent-tool timeout default is one constant.

- Updated dependencies [d85bab1]
- Updated dependencies [aeaf803]
- Updated dependencies [2b174f8]
- Updated dependencies [df79faf]
- Updated dependencies [133c0ee]
- Updated dependencies [543f79d]
- Updated dependencies [4f89d7d]
- Updated dependencies [d951434]
- Updated dependencies [b210b56]
- Updated dependencies [f61ffdd]
- Updated dependencies [88f93c0]
- Updated dependencies [c5aea8b]
- Updated dependencies [9899bd7]
  - @niscorp/signal@0.2.0
  - @niscorp/solid@0.2.0

## 0.1.6

### Patch Changes

- 41ac0c7: DESIGN.md and the README say what the code does: the loop streams unless `transport: 'step'`, no event carries per-step usage, the schema check is conversion, no `$ref` and at most 8,192 characters (native also needs `nativeJsonSchema` and is sent with `strict: false`), `onRun` is an option of `createManifold`, and `agent.run` takes `agentPath`.

  **What to change:** nothing. Documentation only.

- Updated dependencies [a2d2df0]
  - @niscorp/solid@0.1.3

## 0.1.5

### Patch Changes

- e7c45c3: A tool call whose arguments fail their schema is told which field is wrong, as an output is. The loop printed zod's top-level issues as they were, so a union in a tool's input came back as `: Invalid input`; it now goes through `flattenSchemaIssues`, as output does (`view.title: Invalid input: expected string, received undefined`).

  `flattenSchemaIssues` reports a record key that breaks its rule with the rule's own message (`scores.Bad: keys are lower-case letters`) instead of zod's outer `Invalid key in record`. `SchemaIssue` gains two optional fields, `issues` and `origin`, which zod's issues already carry.

  How a branch of a failed union is chosen is unchanged.

  **What to change:** nothing.

## 0.1.4

### Patch Changes

- 1dcccd7: An envelope with a misspelt key is no longer accepted as the agent's data.

  A model may send the payload alone, without `{ response, data, reasoning }` around it, and cortex reads it as the data when it passes the agent's schema. A schema that takes any object passed everything: under `z.record(z.string(), z.unknown())` the answer `{ respnse: 'Done.', data: { id: 7 } }` came back as the data, whole, and under an object schema whose fields are all optional it came back as `{}`. The run finished with the wrong data and no correction.

  The payload alone is now read only when the schema can tell it from an envelope, which is when the schema refuses an object that holds one unknown key. Under any other schema an unknown key is reported to the model, as it is for an agent with no data schema.

  **What to change:** nothing. An agent whose data schema takes any object (a record, or an object with only optional fields) and whose model sends the payload alone now spends one correction round on it. Prism's mapping agent is one such agent, because any JSON object is a Prism config. A required field in the schema, or `z.strictObject`, keeps the payload-alone reading.

- a4ccf0e: The README states thirteen facts about the API that were written only in source comments, and DESIGN.md gives the condition for reading a bare payload.

  The README now says what `meta.usage.reported` means, what `repeatedCalls(n)` counts (n + 1 identical calls), that `prepareStep`'s `activeTools` takes tool names, what `transport: 'step'` does, the order hooks and gates run in, who receives `run-start`, that `output-partial` is best-effort, the three kinds of `retry`, what a resumed run keeps, the reason on an approval that timed out, how a hand-written delegating tool nests its child's events, and how `estimatedTokens` is counted.

  No behaviour changed.

  **What to change:** nothing.

## 0.1.3

### Patch Changes

- 2756aa7: `run.abort(reason)` keeps its reason: it is the `cause` of the aborted result.

  `RunHandle.abort` is typed `(reason?: string) => void` and the reason was dropped — it was not on the result, on any event, or anywhere a caller could read it back.

  A run stopped by `run.abort('the member closed the tab')` now settles with `error.cause: 'the member closed the tab'`, on `run.result` and on the result the `run-end` event carries. `error.code` (`aborted`) and `error.message` are unchanged, and `run.abort()` with no reason gives the result it always gave, with no `cause`.

  The reason is kept beside the run's signal and never put on it: a tool's `ctx.signal` still aborts with an `AbortError`, so a tool — or a `fetch` it started — that tells an abort by that error sees one as before. A run stopped through the caller's own `options.signal` is unchanged too; what that signal was aborted with is not read.

  **What to change:** nothing. If you already pass a reason to `run.abort`, the aborted result now carries it as `error.cause`.

- 0b5a7d6: README and DESIGN describe the loop as it runs. A turn of prose with no envelope in it is corrected without counting against `outputRetries`, so `stepCount` is what ends a model that keeps writing prose, and a `stopWhen` you pass replaces the defaults; `outputRetries(n)` means n attempts and n − 1 corrections. An invalid answer gets the attempt and a system message appended, not a tool error. A `respond` sent beside other tool calls is dropped, and output streamed by a step that ends in tool calls is not the answer. Through Signal a call to a tool the agent does not have is read as an attempted answer, so `tool-end` kind `unknown-tool` is rare. `policy.tools` lists take tool ids, not the names the model calls. A tool's `output` schema types what `execute` returns and is not applied at runtime. No code changed.

  **What to change:** nothing for this release. A `policy.tools` entry written with a tool's name, where its `id` differs, has never matched: write the id.

- 4abbfcc: The README says what a tool's `input` schema may be. The model is sent its JSON Schema, taken from the schema's output side, and a call's arguments are parsed with it twice: by the loop, then again in front of `execute`. So an `input` schema validates and does not convert:
  - One with no JSON Schema (a `.transform()`, a `z.date()`) fails the run before the model is asked, with `code: 'unknown'` and Zod's message.
  - One whose output is another kind than its input (`z.stringbool()`) is described to the model by its output and then refuses what its own first parse produced: the tool never runs.
  - One that changes a value (`.overwrite()`) changes it twice, while the observation's `args` hold the value as parsed once.

  Convert inside `execute`. The README says this under "Errors", and tests hold it. No code changed.

  **What to change:** nothing.

- a02a031: The README and DESIGN say which approval id a resumed run answers to. No code changed.

  `resumeRun` re-asks a pending approval: the resumed run's gates run again for the pending call, and `approval-required` fires again with a new id. DESIGN called the id "stable" and the README said approvals survive restarts, which read as if the id in the snapshot could be answered on the resumed run. It cannot: `resumed.approve(snapshot.pending.approvalId)` does nothing — an id a handle did not ask under is ignored — and with no `policy.approvalTimeoutMs` the run then waits.

  Both documents now say so: answer with the id of the resumed run's own `approval-required` event, as the README's example already does; `snapshot.pending.approvalId` names the ask of the run the snapshot was taken from. DESIGN also says that when the gates no longer ask on resume, the pending call simply runs. A test holds the re-ask and its new id.

  **What to change:** nothing if you answer from the `approval-required` event. If you kept `snapshot.pending.approvalId` to answer with after `resumeRun`, answer with the id of the resumed run's event instead.

- Updated dependencies [5923e38]
- Updated dependencies [2815107]
- Updated dependencies [885bc1e]
- Updated dependencies [f9f1b26]
- Updated dependencies [e3e0ff2]
- Updated dependencies [ed9d7f4]
  - @niscorp/solid@0.1.2

## 0.1.2

### Patch Changes

- 06d1531: The README's first run says why it failed. Its install line now names `openai`, the SDK Signal loads when a model on Groq, OpenAI or OpenRouter is called: without it the quick example's run failed with `Missing dependency: openai`. And the example prints the reason when a run fails (`else console.error(result.error.message)`): a failed run returns its reason and does not throw, so with no API key set the example ended in silence, exit code 0. No code changed.

  **What to change:** nothing.

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

- Updated dependencies [fe30458]
  - @niscorp/solid@0.1.1

## 0.1.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.
