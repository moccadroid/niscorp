# create-nisc

A new [nisc](https://github.com/moccadroid/niscorp) application.

```bash
npm create nisc
```

Four questions, because they are what shape the files:

1. **Where should it go?** The folder's name becomes the app's name.
2. **Who leads?** You — classic: you build the screens, and a first one that
   works is there. Or a model — model-first: there is no navigation; a person
   types a message, and the answer is a screen composed from the app's actions
   (below).
3. **Where does the shell run?** On a server — moss: one shell per person on
   the server, the charter enforced there. Or in the page — no server: offline,
   static hosting, and the charter is not a security boundary. A model-first
   app is behind moss, and is not asked.
4. **What draws the screen?** React, or plain DOM (no framework in the page).

A model-first app then asks for its keys, masked (see "Keys" below): Groq for
gpt-oss-120b, TypeSafe for Jev, and the embeddings — OpenAI, OpenRouter or none.

```bash
npm create nisc my-app -- --page --dom     # flags answer the questions
npm create nisc my-app -- --model-first    # a model leads; the keys are asked
npm create nisc my-app -- --yes            # the defaults: classic, moss, React
```

| | |
|---|---|
| `dir` | where the app goes (default `my-nisc-app`) |
| `--classic` / `--model-first` | you build the screens (the default), or a model composes one for every message |
| `--moss` / `--page` | the shell on a server (the default), or in the page |
| `--react` / `--dom` | React draws the screen (the default), or plain DOM |
| `--yes` | take the defaults for anything not given, and ask nothing |
| `--workspace` | depend on the nisc packages of the workspace it is made in (`workspace:^`) — for an app inside the nisc repository |
| `--help`, `-h` | this list |

With no terminal to ask in, the flags are all there is and the rest takes the
defaults. An option it does not know is an error, never ignored — a typo must
not quietly make a different app.

## What you get

The structure the rulebook describes, and a first screen that works:

- one action on a canvas, a kit of five primitives with its stylesheet, and an
  entry — the first screen **arrives as markup** (drawn by the server, or
  written at build) and is picked up by the page;
- `npm run dev`, `build`, `check` and `start` — and, with the shell in the
  page, `export` — all the `nisc` command; `nisc dev` runs a moss app's server inside vite, so its
  `vite.config.ts` holds nothing but the framework's plugin;
- three checks: the artifacts are pure, schema-valid JSON; the source is at the
  installed grammars (`strata.lock.json`); the welcome screen is served, drawn
  and pressed;
- every `@niscorp` package at **the release this create-nisc was built and
  checked against** — a caret range from each one's version (such as `^0.2.0`), not
  whatever is newest — and `@niscorp/nisc` itself, which pins that set
  exactly and carries the rulebook.

A model-first app has, instead of the welcome screen:

- a frame of three parts — the bar (the screens, what was asked, and the stack
  of answers: back, forward, or any of them from the list behind its counter),
  four areas an answer is placed on, and the line to ask in;
- **screens** (`src/app/screens.ts`): prepared answers shown together, opened
  from the bar's menu without asking; the first is the dashboard the app opens
  on, and falls back on when nothing answers;
- **the message loop** (`src/server/compose/`): Jev picks the prepared answers
  that fit a message in about 300 ms, and the screen shows them at once;
  gpt-oss-120b then fills in what the message says (a form's fields, the value
  to filter by) and its plan replaces the first, placed so that nothing already
  on screen moves. It may also say a few words — a title and two short
  sentences — where no prepared answer shows what was asked. The model opens a
  form filled in; only the person saves it, and a saved form goes;
- **prepared answers** (`src/app/answers.ts`): an action, the input it opens
  with, and what it shows in words — what a message is matched to;
- seven small actions — the line and the bar, and a table, a number, bars, a
  form and a few words for the areas — over a table of five hello-worlds, so
  the first question has a real answer;
- a check that runs the loop offline with a scripted decision model and chat
  model: typed, picked, filled in, placed without moving, read, written and
  gone, a screen opened, a few words, back and forward.

And two documents:

- **`PLAN.md`** — what was decided when it was made (the posture with its
  consequences, the renderer), and everything else the rulebook's interview
  asks, written down as **open**. Nothing gets built on an open decision.
- **`AGENTS.md`** — where the rules are: `node_modules/@niscorp/nisc/AGENTS.md`,
  the rulebook for the version installed. It does not copy them.

## A folder that already exists

It never overwrites. A folder that already holds something is fine — a fresh
repository's `.git`, a `LICENSE` — as long as nothing a new app would write is
there. Your `README.md` is kept; your `.gitignore` gets the lines it lacks. If
anything else it would write already exists, it writes **nothing** and names
the files; make the app in a subfolder instead:

```bash
npm create nisc site -- --page --dom
```

## How an app is put together

An app is made of **items**, one for each answer, plus the ones every app has.
Each is a folder under `templates/`, and the questions are
`templates/questions.json`: the command's code names no item, so a new kit, a
new shell or a new kind of app is a new folder, and its flag and its place in
the questions follow from it.

```
templates/
  questions.json          [{ id, message }], in the order they are asked
  <item>/
    item.json             what it answers, and what it adds
    files/                written into every app made with it
    with/<other item>/    written only when that other item is chosen too
    agents-section.md     a section added to the app's AGENTS.md
```

`item.json`:

| field | |
|---|---|
| `id` | the folder's name, and its flag: `--<id>` |
| `answers` | the question it answers; absent, every app has it |
| `label`, `hint`, `usage`, `summary` | what the question offers, the flag's line in `--help`, and its words in the line said once it is made |
| `default` | the answer taken when nobody gives one: exactly one per question |
| `requires` | `{ question: item }` — what another question must be answered with; that question is then not asked |
| `package` | a `package.json` fragment: fields, `scripts`, `dependencies`, `devDependencies` (`workspace:^` for a nisc package) |
| `env` | the keys it asks for: `{ name, message, required? }`, or `{ choose, message, options: [{ value, label, keys? }] }` |
| `docs` | its lines in AGENTS.md and PLAN.md: `is`, `where`, `runs`, `decisions`, `answered`, `open`, `order` |
| `with` | `{ <other item>: { package, env, docs } }` — added only when that other item is chosen too |

Two items that write the same file, or disagree about a field, a script or a
dependency, is a mistake in the templates: it is refused before anything is
written. In every file, `nisc-template-app` becomes the app's name.

## Keys

An item that needs keys asks for them after the questions, masked, and they go
into `.env`; `.env.example` gets the names alone. A key left empty is filled in
`.env` later. Keys are never flags — a flag stays in the shell's history — so
with no terminal to ask in, they are read from the environment. A `.env` that
is already there keeps what it holds and gains only the lines it lacks.

## Why it can be trusted to work

CI makes every kind of app with the built `create-nisc`, outside the
repository, installs it from the packed packages under pnpm's strict
resolution, and typechecks, checks, builds and serves it (`pnpm check:create`);
its tests make every combination the questions allow and refuse any two items
that collide. A new app starts from something that works today.

## License

Apache-2.0
