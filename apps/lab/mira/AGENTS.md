# mira

A nisc application. **The rules it is built by are `node_modules/@niscorp/nisc/AGENTS.md`** — read all of it before changing anything here (it is there once the app's dependencies are installed). It is the rulebook for the nisc version this app has installed, and `STYLE_GUIDE.md` sits beside it. The grammars it names — a layout node, an `ActionDefinition`, a Prism config, a charter, a Vex DSL — are in each package's own `README.md` and `DESIGN.md`, under `node_modules/@niscorp/<name>/`.

What is particular to this app:

- **Its decisions are in PLAN.md.** What was answered when it was made, what was derived, and what is still open. An open decision point is asked before anything is built on it, never resolved silently.
- **It is led by a model: every message is answered with a screen composed from the app's actions**, behind moss, drawn with React.
- **Where things go:**

```
src/app/screens.ts  the screens in the bar’s menu: canvases shown together; the first is the one the app opens on
src/app/arrangements.ts  how an answer is laid out: layouts for the frame’s `answers` region, and what each suits
src/server/compose/ the message loop: the open screen read, Jev's pass, gpt-oss-120b composes, the plan is placed
                    (catalog.ts: the actions the model may place, the reads they show, the writes a form saves through)
src/server/models/  the models, from .env
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

There is no chat history: the screen open when a message arrives is the conversation. A person types into the line at the bottom, and the answer is a screen: up to six canvases — an action opened with an input, and why it is there — on the areas `a`–`f`, most important first. The bar keeps what was asked and the stack of answers — back, forward, or any of them from the list behind its counter — and holds the menu of **screens** (`src/app/screens.ts`): canvases shown together, opened without asking. The first screen is what the app opens on, and the first in the stack. A screen already in the stack is gone back to, not stacked again.

- **The message loop is `src/server/compose/`**, the function `ask`:
  1. **The open screen is read** (`screen.ts`): each canvas's action, input and intent, and what its live data holds beyond its input — a list as its count, the keys of a row and its first three rows; what the person typed into a form.
  2. **Jev's pass** (`pick.ts`): over the message and the open screen, how likely each action, read, write and screen of the catalog belongs in the answer, and the arrangement. About 250 ms. Whether a canvas is still wanted is the model's to say: Jev was right 8 of 14 times (PLAN.md D12).
  3. **gpt-oss-120b composes** (`fill.ts`): it sees the catalog — each action with its input schema, each read with the rows it answers and the values it is asked with, each write, the screens, the arrangements — in the part of the prompt that never changes, then the open screen, Jev's picks as a hint, and the message. It replies with the screen: canvases, an arrangement or a grid it writes, a few words (`say`) only where no action shows what was asked, or one of the app's screens as it is (`screen`). The reply is checked whole — every action in the catalog, every input against its action's schema, every read and write one the app ships, every value a read or write is asked with present — and a refused one is sent back once with what is wrong; refused again, a line says so above what was on screen. About 700 ms.
  4. **The answer is laid out,** in an arrangement (`src/app/arrangements.ts`), or a grid the model wrote (`Answers` with its columns, an `Area` for each canvas with its span — anything else is ignored); one without room for the canvases gives way to the smallest that has it. The server swaps it into the region — around moss, through `@niscorp/moss/unverified`, until the app has sign-in; then through `session.draft`.
  5. **The plan is placed by the bar,** with nova's `reconcile`: each area holds exactly what the plan lists for it. The canvases are placed in the order the model gives: it keeps what stays in its order on screen, unless the message asks to move things (PLAN.md D11). A canvas that stays keeps its instance — a form the model fills in is filled where it stands.
- **Jev may take 2 s and the model 8 s.** A Jev pass given up leaves the model to answer alone; a model given up is a line saying it could not be reached.
- **A form an answer opened goes once it is saved** (`answers.saved`); on a screen it stays, emptied.
- **The actions are small, with one purpose each:** a table, a number, bars, a form. Each says what it shows (`description`) and declares its input as a zod schema, which the model's answers are checked against. A new kind of view is a new action, not a bigger one; the ones the model may place are listed in `catalog.ts`.
- **The model never presses anything.** It can open a form filled in; only the person saves it, through a write the app ships (`answers.write`).
- **The keys are in `.env`:** `GROQ_API_KEY` (gpt-oss-120b; without it, a message is answered with a notice saying so), `TYPESAFE_API_KEY` (Jev; without it there is no Jev pass), and `EMBEDDINGS` with its key, for memory.
- **`src/dev/compose-check.ts` runs the loop offline**, with a scripted Jev and a scripted model. **`src/dev/live-ask.ts` asks the real models** a run of thirteen messages, each with the screen it wants, and counts the right ones (`--runs=<n>`, `--why`, `--no-jev`, or messages of your own). It costs a Jev pass and a chat call a message.
