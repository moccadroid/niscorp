---
"@niscorp/signal": patch
---

A new provider, `'openai-responses'`, speaks OpenAI's Responses API (`/v1/responses`). It reaches the models chat completions does not serve, such as `gpt-5.3-codex`, with the same verbs as every chat provider: `complete`, `stream`, `step`, `stepStream`, tools, schemas, images and `embed`. A custom provider can name it as its `adapter`.

Signal keeps the history, as it does everywhere: each request carries the whole conversation and is sent with `store: false`. A reasoning model's reasoning is not carried from one tool turn to the next. The Responses API takes no `stopSequences` and no `seed`, so a request that sets either fails with `E_VALIDATION_FAILED` before anything is sent. No model on the new provider has a registry row yet, so each runs at `UNMEASURED_MODEL`.

`'openai'` is unchanged and still speaks chat completions.

**What to change:** nothing. To reach a Responses-only model, use `createSignal('openai-responses')`.
