## How the assistant answers

The screen fills the page and scrolls; one dock stays at the bottom (`src/app/actions/ask/dock.action.ts`). Read from the top down, the dock has **the conversation** — each turn: what was asked, the sentence the model answered with, and the cards under it — then **the screens** (`src/app/screens.ts`: cards one under another, opened without asking, as a card's link opens one), and **the line to ask in**, which is empty again as soon as a message is sent. Asking never changes the screen behind.

- **The message loop is `src/server/compose/`**, the function `ask`, one run of the model a message:
  1. **The question goes into the conversation at once**, as a turn still being answered (`answer.turn`, on the shell's `talk` canvas). Messages are answered one at a time, in the order they were sent.
  2. **gpt-oss-120b answers, as a cortex agent** (`composer.agent.ts`, `knowledge.ts`, `turn.schema.ts`). It is told, in the part of the prompt that never changes, its instructions — the first paragraph is the app's own, who the assistant is and what it answers about (`ABOUT`) — and the cards the person may be shown (`placeable`, each with its input's JSON Schema, only the ones the person's roles reach); then, for each message, the conversation so far (its last four turns) and the message. It answers with cortex's envelope: its `response`, one sentence it is told to keep to 120 characters, and its `data`, up to three cards — one of the app's actions opened with an input, or words (`say`). What each field means is said on the schema (`.describe()`, nisc rule 15).
  3. **The answer is checked** by the agent's `output.validate` (`turnRefusals`): every card one the app has, its input one its schema takes, exactly one of a card or words, nothing shown twice. An answer that fails is sent back with what is wrong, inside the same run: five tries in all.
  4. **The turn is finished:** its sentence written in, then its cards after it, none of it a step Back takes. A card is opened with its whole input: what the model leaves out is its action's default (`opened`, in `catalog.ts`).
- **An answer that does not come is a turn that says so:** the model could not be reached, its answers kept failing the check, or there is no key. The line under the dock only says something when the call itself fails.
- **The conversation lives as long as the person's shell** (PLAN.md D8): the turns on its `talk` canvas, and what they said, beside the function. For somebody not signed in that is one connection.
- **Every message is recorded as a run** through moss (`session.recordRun`): `nisc-template-app.compose`, with its provider and model, the tokens it spent (`reported: false` where signal estimated them), its steps and how long it took, and whether it ended in an answer. The server logs a line for each (`src/server/runs/`).
- **The app starts as a tour of nisc** (`src/app/actions/guide/`): five screens in the dock — a start, three lessons, and how to make it yours. Cards to read — points, an example in code, or steps, the text in the action's own data, no input; one whose rows are read from a table, `guide.packages`, the shape your own reads take: a table whose rows a migration step writes (`src/db/schema.ts`), an entry whose Prism `mapping` words them (`src/app/vex/guide.entries.ts`), replayed by the action that shows them, granted in the charter — and cards to use: a counter, a checklist and a quick check, each with an input the model can fill ("a counter that starts at 100", "quiz me on the charter"). A card in the conversation works as it does on a screen. Its check is `src/dev/guide-check.ts`.
- **An action you add is small, with one purpose:** it says what it shows (`description`), and declares what the model may open it with as a JSON Schema written with zod, every field described; the model's answers are checked against that same schema (`z.fromJSONSchema`). The ones the model may show are `placeable`, in `src/app/action-catalog.ts`, each granted in the charter.
- **The model never presses anything.** It opens cards with an input — a form filled in — and only the person saves.
- **The key is in `.env`:** `GROQ_API_KEY`; without it, every message is answered with a turn saying so.
- **`src/dev/compose-check.ts` runs the loop offline**, with a scripted model (`src/dev/scripted.ts`), on words and on cards the app does not have — so it passes whatever actions the app ships. **`src/dev/live-ask.ts` asks the real model** its cases (`CASES`) and fails on a miss (`--runs=<n>`, `--why`, `--prompts` for everything the model was sent, or messages of your own). It costs a call a message, and is not part of `npm run check`.

## How to proceed from here

The tour is a starting point, there to be deleted. First the interview: PLAN.md's open items, each answered or delegated by name (the rulebook's "Before any code").

**Remove the tour.** It lives in four places and is named in seven:

1. Delete `src/app/actions/guide/`, `src/dev/guide-check.ts` and `src/app/vex/guide.entries.ts`; in `src/db/schema.ts`, the tour's migration. Deleting a migration is safe only because no database that lasts has run it — the app runs on PGlite, which starts empty every boot. Once one has, the migration is history, and a table goes by appending a migration that drops it (rule 17).
2. `src/app/action-catalog.ts`: drop the `GUIDE` import; `placeable` is `[]` until your own actions are in it.
3. `src/app/charter/charter.ts`: drop `'guide.*'` and `'packages.read'`.
4. `src/app/vex/index.ts`: drop the `guidePackages` import; `ENTRIES` is `[]` until your own entries are in it.
5. `src/dev/all-checks.ts`: drop the `guide-check` line.
6. `src/app/screens.ts`: everything below its two types — your screens instead of the tour's. Until there are actions, one screen of words will do:
   ```ts
   export const SCREENS: readonly [Screen, ...Screen[]] = [{ id: 'start', label: 'Start', cards: [{ action: 'answer.text', input: { title: 'The app', text: 'What it is, in a sentence.' } }] }];
   ```
7. `src/server/compose/knowledge.ts`: `ABOUT`, the assistant's paragraph — who it is in your app, and what it answers about. `src/dev/live-ask.ts`: your cases in `CASES` instead of the tour's.
8. This file: the tour's rows under "Where things go", its paragraph above, and this list; PLAN.md: the tour in D3 and in the order of work. `npm run check` passes again.

What stays is the app: the message loop, the dock and the conversation, the kit, and `compose-check`, which needs nothing of the tour.

## From here to a full app

What the template leaves out, so that it starts small. None of it is required, and the order is yours: take a step when the app needs it, each checked before the next (PLAN.md's order of work).

- **Your data, and cards that show it.** A table in `src/db/schema.ts`, a read in `src/app/vex/`, an action that replays it — as `guide.packages` does — in `placeable`, granted in the charter, with a `live-ask` case for the question it answers. The model is told what a card shows, never the rows: to answer about your data, it shows the card.
- **Writes.** A form card the model may open filled in (D4); the person saves it, through a vex mutation, never the model.
- **Sign-in and roles.** Once more than one person uses the app, or anything in it is somebody's own: who is signed in is moss's (`runtime.session`), what each role may reach is the charter's. The model is offered, and a screen opens with, only the cards the person's roles reach — that filter is already there (`session.actions`). The dock lists every screen: when roles see different ones, give each person their own list through moss's `inputs`.
- **A conversation that outlives the shell** (D8, once there is sign-in). The turns become rows the person owns, written by the server as a machine role at the person's own reach (`executeAs`), read back when their shell is built (`seeds`); `place` and `said` in `src/server/compose/index.ts` are where it goes.
- **Facts the model can rely on,** as the cards need them. When a card takes a date, tell the model today's date, in the app's time zone, in `messageInput`. When it opens a record by its id, tell it the ids that exist, and refuse in `turnRefusals` an id it was not told: a model that makes up an id shows a card of nothing.
- **Asking back, and what to ask next.** A card of choices, each one a message emitted on `ask` when tapped — as the tour's examples are — for when the message could mean two things, or to offer the next question.
- **Deploying.** A real Postgres in `src/server/runtime.ts`, its tables applied by `nisc migrate`, never at boot (rule 17).
