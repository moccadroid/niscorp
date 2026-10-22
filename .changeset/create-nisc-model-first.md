---
'create-nisc': patch
'@niscorp/nisc': patch
---

`npm create nisc` asks who leads. **Model-first** (`--model-first`) is a moss app where a person types a message and the answer is a screen: up to six canvases, each an action opened with an input, on the areas of an arrangement (`src/app/arrangements.ts`) or a grid the model writes. One dock at the bottom holds the screens, a chip naming the answer shown with back, forward and every answer to go back to, and the line to ask in.

Jev, a fast decision model, reads the message and the open screen and says which actions likely belong; gpt-oss-120b on Groq composes the screen as a cortex agent, naming only the areas that change, and its reply is checked against the app's actions, their input schemas and the arrangements, and corrected inside the run when it does not hold. The answer streams in. What a person presses, ticks and picks stays on the screen, the model sees it, and an answer gone back to shows it as it was left. A card's link opens a screen at once; only what is typed, or a thing to ask pressed, goes to the model. Every message is recorded as a run for each model it went to, through `session.recordRun`. It asks for its keys — Groq, and TypeSafe for Jev — and writes them to `.env`.

The app starts as a tour of nisc: five screens of cards to read, and a counter, a checklist and a quick check to use, which the model can fill in too. Its AGENTS.md says how to remove the tour — a folder, a check, and edits in five files — and what to build next. The checks run the loop offline with a scripted decision model and chat model, and `src/dev/live-ask.ts` asks the real models a run of cases.

Both kits gain the components it uses — a frame, the dock, a menu, a grid and its areas, a card, code, points, steps, a checkbox, an input and the line to ask in — and a classic app has them too. The stylesheet gains their look. `src/dev/strata.ts` is each kind's own: a model-first app's also records its frame and arrangements.
