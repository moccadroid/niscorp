# @niscorp/signal

## 0.1.3

### Patch Changes

- 63445cb: `complete()` and `stream()` on a decision provider say their own name.

  Both run through `stepStream`, and the refusal a decision provider gives a chat verb named that instead: `signal.complete('…')` failed with `stepStream() is not available on a decision provider…` and `context.verb: "stepStream"`, for a call the caller never made.

  The error now names the verb that was called — `complete() is not available on a decision provider — it answers decide() and generates no text`, `context.verb: "complete"`, and the same for `stream`. `step`, `stepStream` and `embed` already named themselves.

  Only those two strings change. The code is `E_VERB_NOT_SUPPORTED` as before, it is raised at the same moment (for `stream()`, when the stream is first read), and no request is sent.

  **What to change:** nothing.

- 8973c15: DOCS.md says what `embed()` and `meta.provider.raw` do. `embed()` does not check `supportsEmbedding`: the flag is what `describe()` reports, and the request is sent either way; a refused request is `E_PROVIDER_ERROR` with the provider's own error under `context.raw`. `meta.provider.raw` is `null` after `complete()` and `stream()`, which read the reply as a stream and keep no body (`step()` returns the body), and it is the provider's error for a call Signal recovered from a rejection. No code changed.

  **What to change:** nothing.

- ce21cf7: DOCS.md says what a tool's `input` schema may be. The model is sent its JSON Schema, taken from the schema's output side, and the arguments are parsed with it once. So an `input` schema validates and does not convert:
  - One with no JSON Schema (a `.transform()`, a `z.date()`) rejects the call before any request is made, with Zod's own error rather than a `SignalError`.
  - One whose output is another kind than its input (`z.stringbool()`) is described to the model by its output: told `boolean`, a model that sends one gets `input_invalid` back, and it is the string that is accepted.

  Convert inside `execute`. DOCS.md says this under "Defining Tools", and a test holds the first. No code changed.

  **What to change:** nothing.

## 0.1.2

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

## 0.1.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.
