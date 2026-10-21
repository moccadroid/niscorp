# mira

A nisc application. **The rules it is built by are `node_modules/@niscorp/nisc/AGENTS.md`** — read all of it before changing anything here (it is there once the app's dependencies are installed). It is the rulebook for the nisc version this app has installed, and `STYLE_GUIDE.md` sits beside it. The grammars it names — a layout node, an `ActionDefinition`, a Prism config, a charter, a Vex DSL — are in each package's own `README.md` and `DESIGN.md`, under `node_modules/@niscorp/<name>/`.

What is particular to this app:

- **Its decisions are in PLAN.md.** What was answered when it was made, what was derived, and what is still open. An open decision point is asked before anything is built on it, never resolved silently.
- **It is led by a model: every message is answered with a screen composed from the app's actions**, behind moss, drawn with React.
- **Where things go:**

```
src/app/screens.ts  the screens in the dock: canvases shown together; the first is the one the app opens on
src/app/arrangements.ts  how an answer is laid out: layouts for the frame’s `answers` region, and what each is for
src/server/compose/ the message loop: the open screen read, Jev's pass, gpt-oss-120b composes, the plan is placed
                    catalog.ts       the actions the model may place, the reads they show, the writes a form saves through
                    screen.ts        the open screen, read
                    pick.ts          Jev's pass
                    prompt.ts        what the model is sent
                    reply.schema.ts  what it replies, each field described
                    answer.ts        the reply checked, sent back once if refused, and turned into an answer
                    layout.ts        arrangements and the grids the model writes, as layouts
                    plan.ts, history.ts  the answer as a plan, and the stack of them
                    index.ts         the functions the dock calls
src/server/models/  the models, from .env
src/server/runs/    each model's part in a message recorded as a run, and the line the server logs for it
src/db/         the tables, and the hello-world rows
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

There is no chat history: the screen open when a message arrives is the conversation. The answer fills the page and scrolls; one dock stays at the bottom (`src/app/actions/ask/dock.action.ts`). Read from the screen down to the hands, it holds the **screens** (`src/app/screens.ts`: canvases shown together, opened without asking); a chip naming the answer shown by its title and where it stands ("German greetings · 2/5"), with back and forward beside it, which opens upward to what was asked, what the model said it did, and every answer to go back to, each by its title; and the line to ask in. A person types there, and the answer is a screen: up to six canvases — an action opened with an input, and why it is there — on the areas `a`–`f`. The canvas an answer changed is outlined until the next one. The first screen is what the app opens on, and the first in the stack. A screen already in the stack is gone back to, not stacked again.

- **The message loop is `src/server/compose/`**, the function `ask`:
  1. **The open screen is read** (`screen.ts`), area by area, the words too: each canvas's action, input and intent, and what its live data holds beyond its input — a list as its count and its first three rows, ids left out; what the person typed into a form.
  2. **Jev's pass** (`pick.ts`): over the message and the open screen, how likely each action, read, write and screen of the catalog belongs in the answer. About 200 ms, and worth it: without it the same cases score 52/60 against 58/60. Whether a canvas is still wanted is the model's to say: Jev was right 8 of 14 times (PLAN.md D12).
  3. **gpt-oss-120b composes** (`prompt.ts`, `reply.schema.ts`, `answer.ts`): it sees the catalog — each action with its input's JSON Schema, each read with the rows it answers and the values it is asked with, each write, the screens, the arrangements with where each puts its areas — and the reply's own JSON Schema, in the part of the prompt that never changes; then the open screen, Jev's picks as a hint, and the message. What each field of the reply means is said on the schema (`.describe()`), never in prose beside it (nisc rule 15). It replies first with `reasoning` — one sentence for the person, at most 120 characters, saying what it changes and why, or why nothing changes, shown when the dock's chip is opened, and kept with the answer — and `title` — what the answer is, in at most four words, the name the chip and the stack give it — then with **the areas that change** (PLAN.md D11): each a canvas moved there from another area (`keep`), a canvas, words (`say`, only where no action shows what was asked), or nothing (`drop`); an area it leaves out stays as it is, unless the arrangement it gives has no such area. Or it replies with one of the app's screens as it is (`screen`). The reply is checked whole — every action in the catalog, every input against its action's schema, every read and write one the app ships, every value a read or write is asked with present and none it does not take, every area in the arrangement, nothing kept from an empty area, nothing shown twice — and a refused one is sent back once with what is wrong. About 1 s.
  4. **The answer is laid out,** in the arrangement on screen unless the model gives another (`src/app/arrangements.ts`), or a grid it writes (`grid`: how many columns, and the areas in the order they are drawn, each with its span), which the server turns into the layout. The server swaps it into the region — around moss, through `@niscorp/moss/unverified`, until the app has sign-in; then through `session.draft`.
  5. **The plan is placed by the dock,** with nova's `reconcile`: each area holds exactly what the plan lists for it. A canvas that stays keeps its instance — a form the model fills in is filled where it stands. An answer that changes nothing adds nothing to the stack; the chip still names what was asked and opens to the model's reasoning.
- **A message that gets no screen leaves the screen as it is,** and the line says why: the model refused twice, could not be reached, or there is no key.
- **Jev may take 2 s and the model 8 s.** A Jev pass given up leaves the model to answer alone.
- **Every message is recorded as two runs,** through moss (`session.recordRun`): `mira.jev` and `mira.compose`, each with its provider and model, the tokens it spent (`reported: false` where signal estimated them), how many calls answered, how long it took, and whether it ended in an answer. The server logs a line for each (`src/server/runs/`).
- **A form an answer opened goes once it is saved** (`answers.saved`); on a screen it stays, emptied.
- **The actions are small, with one purpose each:** a table, a number, bars, a form. Each says what it shows (`description`) and declares its input as a JSON Schema written with zod, every field described; the model's answers are checked against that same schema (`z.fromJSONSchema`). A new kind of view is a new action, not a bigger one; the ones the model may place are listed in `catalog.ts`.
- **The model never presses anything.** It can open a form filled in; only the person saves it, through a write the app ships (`answers.write`).
- **The keys are in `.env`:** `GROQ_API_KEY` (gpt-oss-120b; without it, a message is answered with a notice saying so), and `TYPESAFE_API_KEY` (Jev; without it there is no Jev pass).
- **`src/dev/compose-check.ts` runs the loop offline**, with a scripted Jev and a scripted model. **`src/dev/live-ask.ts` asks the real models** the cases asked of mira, each from the screen it was asked on, and counts the right screens: what was asked for, every area it did not ask about holding the same canvas, nothing shown twice (`--runs=<n>`, `--why`, `--prompts` for everything the models were sent, `--no-jev`, or messages of your own). It costs a Jev pass and a chat call a message.
