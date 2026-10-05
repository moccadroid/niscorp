# @niscorp/cortex

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
