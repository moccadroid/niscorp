---
'create-nisc': patch
'@niscorp/nisc': patch
---

`npm create nisc` asks who leads. **Model-first** (`--model-first`) is a moss app with no navigation: a person types a message, and the answer is a screen — up to four small actions placed on four areas, with a bar that keeps what was asked and goes back and forward through the answers. Jev picks the prepared answers that fit (`src/app/answers.ts`: an action, its input, and what it shows in words) in about 300 ms; gpt-oss-120b on Groq then fills in what the message says and its plan replaces the first. The model opens a form filled in; only the person saves it. It asks for its keys — Groq, TypeSafe, and embeddings from OpenAI, OpenRouter or none — and writes them to `.env`. It ships eight actions over five hello-world rows, and a check that runs the loop offline with a scripted decision model and chat model.

Both kits gain the components it uses — a frame, a bar, the answer's areas, a card, a table, a number, bars, an input, a field, the line to ask in — and a classic app has them too. The stylesheet gains their look.
