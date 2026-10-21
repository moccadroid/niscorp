# mira

A nisc application. **The rules it is built by are `node_modules/@niscorp/nisc/AGENTS.md`** — read all of it before changing anything here (it is there once the app's dependencies are installed). It is the rulebook for the nisc version this app has installed, and `STYLE_GUIDE.md` sits beside it. The grammars it names — a layout node, an `ActionDefinition`, a Prism config, a charter, a Vex DSL — are in each package's own `README.md` and `DESIGN.md`, under `node_modules/@niscorp/<name>/`.

What is particular to this app:

- **Its decisions are in PLAN.md.** What was answered when it was made, what was derived, and what is still open. An open decision point is asked before anything is built on it, never resolved silently.
- **It is led by a model: every message is answered with a screen composed from the app's actions**, behind moss, drawn with React.
- **Where things go:**

```
src/app/actions/guide/  the tour of nisc the app starts with: cards to read, and a counter, a checklist and a quick check to use — delete it to start your own
src/app/screens.ts  the screens in the dock — the tour's lessons: canvases shown together; the first is the one the app opens on
src/app/arrangements.ts  how an answer is laid out: layouts for the frame’s `answers` region, and what each is for
src/server/compose/ the message loop: the open screen read, Jev's pass, gpt-oss-120b composes, the plan is placed
                    catalog.ts       the actions the model may place, the reads they show, the writes a form saves through
                    screen.ts        the open screen, read
                    pick.ts          Jev's pass
                    composer.agent.ts  the composer: a cortex agent
                    knowledge.ts     what it is told: its instructions, the catalog as producers, the run’s input
                    reply.schema.ts  what it replies, each field described
                    answer.ts        what refuses a reply, and the answer a reply is turned into
                    layout.ts        arrangements and the grids the model writes, as layouts
                    plan.ts, history.ts  the answer as a plan, and the stack of them
                    index.ts         the functions the dock calls
src/server/models/  the models, from .env
src/server/runs/    each model's part in a message recorded as a run, and the line the server logs for it
src/db/         your tables, as a strata sequence (none yet)
src/app/        ARTIFACTS ONLY — the manifest (app.ts), the charter, the actions, the shell
src/server/     the environment (runtime.ts), the boot, how a screen is drawn (document.ts)
src/ui/         the kit — the only renderer code, with src/main.tsx, the terminal entry
src/dev/        the checks (`npm run check`) — a new feature adds its own
nisc.config.ts  how the app boots and how its screens are drawn, for the `nisc` command
strata.lock.json  the grammar versions the source is written at (rule 20) — moved only
                by `npm run strata verify`, never by hand
```

- **How it runs:** `npm run dev`, `npm run build`, `npm run check`, `npm start` — all of them the `nisc` command — and `npm run strata status` for the grammars.

## How the model leads

There is no chat history: the screen open when a message arrives is the conversation. The answer fills the page and scrolls; one dock stays at the bottom (`src/app/actions/ask/dock.action.ts`). Read from the screen down to the hands, it holds the **screens** (`src/app/screens.ts`: canvases shown together, opened without asking, as a card's link opens one); a chip naming the answer shown by its title and where it stands ("The charter · 2/5"), with back and forward beside it, which opens upward to what was asked, what the model said it did, and every answer to go back to, each by its title; and the line to ask in. A person types there, and the answer is a screen: up to six canvases — an action opened with an input, and why it is there — on the areas `a`–`f`. The canvas an answer changed is outlined until the next one. The first screen is what the app opens on, and the first in the stack. A screen already in the stack is gone back to, not stacked again.

- **The message loop is `src/server/compose/`**, the function `ask`:
  1. **The open screen is read** (`screen.ts`), area by area, the words too: each canvas's action and intent; its input as it stands, with what the person pressed, ticked or picked in what the input carries; and what else its live data holds beyond what it was opened with — a list as its count and its first three rows, ids left out; a line being typed. Before anything else is shown — an answer, a screen, back or forward — the screen as it stands is kept with the answer it is on, as a browser keeps a page's form: going back shows it as the person left it.
  2. **Jev's pass** (`pick.ts`): over the message and the open screen, how likely each action, read, write and screen of the catalog belongs in the answer. About 200 ms, and measured to be worth it (PLAN.md D6). Only a hint: the model decides, and only what the pass finds likely (0.5 or more) is shown to it. Whether a canvas is still wanted is the model's to say (PLAN.md D12).
  3. **gpt-oss-120b composes, as a cortex agent** (`composer.agent.ts`, `knowledge.ts`, `reply.schema.ts`, `answer.ts`). Its producers give it the catalog — each action the person holds, with its input's JSON Schema, each read with the rows it answers and the values it is asked with, each write, the screens, the arrangements with where each puts its areas — and cortex's OUTPUT SCHEMA, the envelope with the reply's own JSON Schema in it, in the part of the prompt that never changes; the run's input is the open screen, Jev's picks as a hint, and the message. What each field of the reply means is said on the schema (`.describe()`), never in prose beside it (nisc rule 15). It answers with cortex's envelope: its `reasoning` first, then its `response` — one sentence for the person, at most 120 characters, saying what it changes and why, or why nothing changes, shown when the dock's chip is opened, and kept with the answer — then its `data`, the reply: its `title` — what the answer is, in at most four words, the name the chip and the stack give it — then **the areas that change** (PLAN.md D11): each a canvas moved there from another area (`keep`), a canvas, words (`say`, only where no action shows what was asked), or nothing (`drop`); an area it leaves out stays as it is, unless the arrangement it gives has no such area — and then the room, when the one on screen will not do: an arrangement, or a grid of its own. Or it replies with one of the app's screens as it is (`screen`). The reply is checked whole — every action in the catalog, every input against its action's schema, every read and write one the app ships, every value a read is asked with present and none it does not take, every field a write saves present, every area in the arrangement, nothing kept from an empty area, nothing shown twice — by the agent's `output.validate`, and one that does not hold, or does not fit the schema, is corrected inside the same run with what is wrong with it: three answers at most (cortex's `outputRetries`). About 1 s.
  4. **The answer is laid out,** in the arrangement on screen unless the model gives another (`src/app/arrangements.ts`), or a grid it writes (`grid`: how many columns, and the areas in the order they are drawn, each with its span), which the server turns into the layout. The server swaps it into the region — around moss, through `@niscorp/moss/unverified`, until the app has sign-in; then through `session.draft`.
  5. **The plan is placed by the dock,** with nova's `reconcile`: each area holds exactly what the plan lists for it. A canvas that stays keeps its instance and what the person did to it; a card the model writes again is written where it stands. A canvas written onto a screen holds its whole input — what it leaves out is its action's default (`opened`, in `catalog.ts`) — so a card written where another was keeps nothing of it (PLAN.md D13). An answer that changes nothing adds nothing to the stack; the chip still names what was asked and opens to the model's reasoning.
  6. **The answer streams in.** Cortex hands the composer the reply as solid parses it, while the model writes it. Once an area's entry is followed by the next, or by the room, it is finished, and it is placed in the room on screen if its own checks pass; another room, or a screen, comes with the whole reply; the dock re-reads the answer so far (`answers.current`) whenever the message `answer-moved` says it moved. Whether the whole reply holds is checked when it ends. A correction, or a run that ends without an answer, puts the screen back as it was.
- **A message that gets no screen leaves the screen as it is,** and the line says why: the model's reply did not fit, it could not be reached, or there is no key.
- **Jev may take 2 s and the model 8 s.** A Jev pass given up leaves the model to answer alone.
- **Every message is recorded as two runs,** through moss (`session.recordRun`): `mira.jev` and `mira.compose`, each with its provider and model, the tokens it spent (`reported: false` where signal estimated them), its steps and how long it took — for the composer, cortex's run meta — and whether it ended in an answer. The server logs a line for each (`src/server/runs/`).
- **The app starts as a tour of nisc** (`src/app/actions/guide/`): five screens in the dock, each a lesson. Cards to read — points, an example in code, or steps, the text in the action's own data, no input — and cards to use: a counter, a checklist and a quick check, each with an input the model can fill. A card's link opens another screen at once, as the dock's buttons do; only what is typed, or one of the welcome's things to ask, goes to the model. What a person presses, ticks and picks stays on the screen; the model sees it, and can change it: "tick off the first step", "a counter that starts at 100", "quiz me on the charter". To start your own app, delete the folder and its lines in the action catalog, `catalog.ts`, the charter and the screens.
- **An action you add is small, with one purpose:** it says what it shows (`description`), and declares what the model may open it with as a JSON Schema written with zod, every field described; the model's answers are checked against that same schema (`z.fromJSONSchema`). A read or a write it names must be one the app ships, asked with the values it takes. The ones the model may place are listed in `catalog.ts`.
- **The model never presses anything.** It opens cards with an input — a checklist with a step ticked, a form filled in — and only the person saves.
- **The keys are in `.env`:** `GROQ_API_KEY` (gpt-oss-120b; without it, a message is answered with a notice saying so), and `TYPESAFE_API_KEY` (Jev; without it there is no Jev pass).
- **`src/dev/compose-check.ts` runs the loop offline**, with a scripted Jev and a scripted model. **`src/dev/live-ask.ts` asks the real models** the cases asked of mira, each from the screen it was asked on, and counts the right screens: what was asked for, every area it did not ask about holding the same canvas, nothing shown twice (`--runs=<n>`, `--why`, `--prompts` for everything the models were sent, `--no-jev`, or messages of your own). It costs a Jev pass and a chat call a message.
