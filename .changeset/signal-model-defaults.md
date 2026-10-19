---
'@niscorp/signal': minor
---

A request to a model gets the options its maker or provider documents for whatever the caller leaves unset: `modelDefaults`, exported beside `modelRegistry`. gpt-oss on Groq gets temperature 1 and top_p 1, OpenAI's sampling for it (at temperature 0 its reasoning repeats one sentence until the budget runs out), and maxTokens 16,384, because Groq ends a completion at 3,072 tokens unless asked for more and reasoning alone can pass that. The caller's options always win.
