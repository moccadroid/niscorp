---
'create-nisc': patch
'@niscorp/nisc': patch
---

`npm create nisc` asks who leads. **Model-first** (`--model-first`) is a moss app where a person types a message and the answer is a screen — up to four small actions placed on four areas — with a bar that holds the menu of screens, what was asked, and the stack of answers — back, forward, or any of them from a list; a screen already in the stack is gone back to, not stacked again. Jev picks the prepared answers that fit (`src/app/answers.ts`: an action, its input, and what it shows in words) in about 300 ms; gpt-oss-120b on Groq then fills in what the message says, and its plan replaces the first without moving what is already on screen. Where no prepared answer shows what was asked, the model says a few words: a title and two short sentences. The model opens a form filled in; only the person saves it, and a saved form goes. Screens (`src/app/screens.ts`) are prepared answers shown together, opened from the menu; the first is the dashboard the app opens on and falls back on. It asks for its keys — Groq, TypeSafe, and embeddings from OpenAI, OpenRouter or none — and writes them to `.env`. It ships seven actions over five hello-world rows, and a check that runs the loop offline with a scripted decision model and chat model.

Both kits gain the components it uses — a frame, a bar, a menu, the answer's areas, a card, a table, a number, bars, an input, a field, the line to ask in — and a classic app has them too. The stylesheet gains their look.
