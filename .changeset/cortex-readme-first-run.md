---
"@niscorp/cortex": patch
---

The README's first run says why it failed. Its install line now names `openai`, the SDK Signal loads when a model on Groq, OpenAI or OpenRouter is called: without it the quick example's run failed with `Missing dependency: openai`. And the example prints the reason when a run fails (`else console.error(result.error.message)`): a failed run returns its reason and does not throw, so with no API key set the example ended in silence, exit code 0. No code changed.

**What to change:** nothing.
