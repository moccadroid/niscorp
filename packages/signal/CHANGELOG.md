# @niscorp/signal

## 0.2.0

### Minor Changes

- d85bab1: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app calls `.apiKey(k)` on a custom provider that has its own `apiKey` and relied on the provider's key being sent.

  `.apiKey(k)` now overrides the key of a custom provider that has its own `apiKey`, as DOCS says: `createSignal({ baseUrl, apiKey: 'provider-key', model }).apiKey('override-key')` sent `Bearer provider-key` and now sends `Bearer override-key`. `createSignal(custom, { apiKey })` keeps its order: the provider's own key is sent when it has one.

- aeaf803: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on a Groq tool call that was cut off inside its arguments being run with the arguments closed.

  A result now says how the provider ended the reply. `meta.finishReason` on `complete()` and `stream()` is the last reply's finish reason (`stop`, `length`, `content_filter`, …). A `step()` or `stepStream()` result whose output was rescued from a reply the provider cut off (`length` or `content_filter`) while its JSON was still open carries `wire.truncated: true`: `{"items":["alpha","beta","gam` gives `{ items: ["alpha","beta"] }` as before, now marked.

  An output rescued from an attempt a provider's rejection carried cut short (a Groq `failed_generation` with its JSON open, from `json_validate_failed` or a call to the exit tool) is marked `wire.truncated` too. `meta.finishReason` is `error_recovered` when the last reply was recovered from a rejection: that value is signal's, not a provider's.

  `refuseCutOff: true` (on `createSignal`, or `output.refuseCutOff` on a `step()` request) turns such a reply, or such an attempt, into a failed attempt with `truncated: true` and the evidence `the reply was cut off (finish reason "length") before its JSON closed. It began: …`, so `complete()` retries it. A reply that ended with `stop`, or whose JSON closed before the cut, is never refused. Without the option nothing changes.

  A tool call recovered from a Groq rejection (`failed_generation`) that was cut off inside its arguments is no longer run with the arguments closed: `{"name":"transfer","arguments":{"to":"acct-1","amount":10` (the model was writing 1000) ran `transfer` with 10. Its arguments now go on as the text they are, the tool's input check fails, and the model is told `input_invalid` and calls again. A rejected call whose arguments are whole runs as before: one missing only its outer `}`, or cut in a key or value after its arguments (`…"amount":1000},"id":"call_1`).

- 2b174f8: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on `complete()` or `stream()` without a schema answering `''` when the provider rejected the reply.

  `complete()` and `stream()` without a schema now reject with `E_PROVIDER_ERROR` (`Provider rejected the reply: …`, the provider's error in `context.raw`) when the provider rejected the reply and nothing could be recovered from it. A Groq `tool_use_failed` for a call to a tool that was not declared resolved with `response: ''` as if the model had answered; it now throws, as the same call throws on a provider without the `failed-generation` strategy. With a schema nothing changes: such a reply is retried as before. A rejected call to a declared tool is still recovered and run.

- df79faf: BREAKING — approved by moccadroid (owner), 2026-11-22: code that detects an aborted `stream()` by its error ("stream ended without a done event") checks `signal.aborted` after the loop instead.

  An `AbortSignal` now aborts every call: the one set with `.options({ signal })` is read by `complete()`, `stream()`, `step()`, `stepStream()`, `embed()` and `decide()`, and `step()` takes `{ signal }` as its second argument. An aborted `stream()` ends without a `done` event instead of throwing "stream ended without a done event"; `complete()`, `step()`, `embed()` and `decide()` reject with `E_PROVIDER_ERROR`, and a call aborted before it starts sends nothing.

  A tool that takes no arguments now runs in `complete()` and `stream()` when the provider sends its call with no argument text, instead of failing its input check.

  A tool call recovered from a provider's rejection gets a short random id instead of `recovered_<n>` from a counter that started again in every process, so a resumed conversation no longer repeats an id.

- 543f79d: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app relied on two tool calls a provider streams at one index being merged into one.

  A streamed tool call is now told apart by its id as well as its index. When a provider sends a piece with a new id at an index another call already has, it starts a new call instead of being appended to that call: `add {"a":1}` and `mul {"b":2}`, both at index 0, were one call `mul` with the arguments `{"a":1}{"b":2}`, and are now two calls with their own arguments. The new call gets the next index no call has, so `tool_call_delta` events for pieces `a`@0, `b`@0, `c`@1 carry indices 0, 1 and 2. A provider that sends one id per index (OpenAI, Groq, OpenRouter, the Responses adapter) sees no change.

### Patch Changes

- 133c0ee: An abort now ends `stream()`, `stepStream()` and `complete()` at once while the provider's SDK waits out a rate limit's `retry-after`; before, they ended only when that wait was over. `step()`, `embed()` and `decide()` still wait it out.

  `step()` now returns `reasoning` when the provider sends the model's thinking in a non-streaming reply (`message.reasoning` or `message.reasoning_content`) without being asked. The request is unchanged.

  A custom provider naming an unknown `wire` strategy id now throws a `SignalError` with code `E_VALIDATION_FAILED` and `context.wire`, with the same message; before, it was a plain `Error`.

  When a reply on OpenAI contains more than one JSON value, DOCS says which one answers: the first that passes the schema.

  DOCS shows a multi-turn conversation that sends the system prompt and the schema once a turn, says that `stream()` throws a missing key when it is called, and names the second "Abort" heading "Abort a decision".

## 0.1.9

### Patch Changes

- 4e76fe8: DESIGN.md's file map lists `stream/` and says `adapters/openai-sdk.ts` is the shared OpenAI SDK loader, not a protocol.

  **What to change:** nothing. Documentation only.

## 0.1.8

### Patch Changes

- ab4fe9d: A new provider, `'openai-responses'`, speaks OpenAI's Responses API (`/v1/responses`). It reaches the models chat completions does not serve, such as `gpt-5.3-codex`, with the same verbs as every chat provider: `complete`, `stream`, `step`, `stepStream`, tools, schemas, images and `embed`. A custom provider can name it as its `adapter`.

  Signal keeps the history, as it does everywhere: each request carries the whole conversation and is sent with `store: false`. A reasoning model's reasoning is not carried from one tool turn to the next. The Responses API takes no `stopSequences` and no `seed`, so a request that sets either fails with `E_VALIDATION_FAILED` before anything is sent. No model on the new provider has a registry row yet, so each runs at `UNMEASURED_MODEL`.

  `'openai'` is unchanged and still speaks chat completions.

  **What to change:** nothing. To reach a Responses-only model, use `createSignal('openai-responses')`.

## 0.1.7

### Patch Changes

- f4a3f04: `decide()` can ask about images: `images` maps a uuid to an `ImageSource`, and a string in `state` equal to a uuid points at that image.

  On `typesafe` the images go as the request's `assets` with the `TypeSafe-Danger-Zone-Images: true` header, so Jev answers about them with calibrated probabilities. TypeSafe takes PNG or JPEG data; a `url` image or another `mediaType` fails with `E_VALIDATION_FAILED` before the request. On a chat provider each image follows the state in the emulation message, after a label with its uuid; a model whose registry row says `multimodal: false` is refused before the request. A key that is not a uuid is refused on every provider.

  A request without `images`, or with `images: {}`, is unchanged: TypeSafe gets the same body and headers, and a chat provider the same single text message.

  **What to change:** nothing. A caller that posts images to TypeSafe itself can pass them to `decide()` instead.

## 0.1.6

### Patch Changes

- 6776f2d: A reply missing only its closing brace comes back whole, not as a piece of itself.

  The repair ladder tried `extract` before `close-truncated`. On `{"reasoning":"…","data":{"rows":[…]}` — complete but for the last `}` — `extract` found the `rows` array inside it, and any acceptance schema that admits arrays (Cortex's does) took that array as the answer. Cortex then rejected it as not an envelope, and the model was asked again, up to its output-retry limit. The ladder now closes a cut-off reply before it looks for JSON inside it, so the whole object arrives at `wire.rung: 'close-truncated'`.

  Only a reply that opens with `{` or `[` and is left unclosed takes a different path. A complete reply, a fenced or prose-wrapped one, and tool-call arguments go through the ladder as before.

  **What to change:** nothing.

## 0.1.5

### Patch Changes

- c952ab0: A request to a model gets the options its maker or provider documents for whatever the caller leaves unset: `modelDefaults`, exported beside `modelRegistry`. gpt-oss on Groq gets temperature 1 and top_p 1, OpenAI's sampling for it (at temperature 0 its reasoning repeats one sentence until the budget runs out), and maxTokens 16,384, because Groq ends a completion at 3,072 tokens unless asked for more and reasoning alone can pass that. The caller's options always win.

## 0.1.4

### Patch Changes

- a8b7133: DOCS.md states thirty-nine facts about the API that were written only in source comments, and describes `resolveTransport`.

  `step()` and `stepStream()` now have their request and result fields described: the shape of a tool-calling transcript, `output.accept` and `output.outputTool`, what `toolCalls[].args` holds, what `usage.reported: false` means, `outcome`, `wire.rung` and `wire.recovered`, and the `reasoning` and `tool_call_delta` events. A new subsection gives `resolveTransport(spec, capabilities)`: every field of the spec and of the result. Also added: what `UNMEASURED_MODEL` assumes, `chatProviderEntry`, that `describe()` makes no request, that an OpenRouter row lists what the proxy accepts, and that `jev-latest` is an alias.

  No behaviour changed.

  **What to change:** nothing.

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
