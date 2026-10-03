# create-nisc

A new [nisc](https://github.com/moccadroid/niscorp) application.

```bash
npm create nisc
```

Three questions, because they are what shape the files:

1. **Where should it go?** The folder's name becomes the app's name.
2. **Where does the shell run?** On a server — moss: one shell per person on
   the server, the charter enforced there. Or in the page — no server: offline,
   static hosting, and the charter is not a security boundary.
3. **What draws the screen?** React, or plain DOM (no framework in the page).

```bash
npm create nisc my-app -- --page --dom     # flags answer the questions
npm create nisc my-app -- --yes            # the defaults: moss, React
```

An option it does not know is an error, never ignored — a typo must not quietly
make a different app.

## What you get

The structure the rulebook describes, and a first screen that works:

- one action on a canvas, a kit of five primitives with its stylesheet, and an
  entry — the first screen **arrives as markup** (drawn by the server, or
  written at build) and is picked up by the page;
- `npm run dev`, `build`, `check`, and `start` or `export` — all the `nisc`
  command; `nisc dev` runs a moss app's server inside vite, so its
  `vite.config.ts` holds nothing but the framework's plugin;
- three checks: the artifacts are pure, schema-valid JSON; the source is at the
  installed grammars (`strata.lock.json`); the welcome screen is served, drawn
  and pressed;
- every `@niscorp` package pinned to **the release this create-nisc was built
  and checked against** — not to whatever is newest — and `@niscorp/nisc`
  itself, which pins that set exactly and carries the rulebook.

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

## Why it can be trusted to work

The four templates are real apps in the nisc repository: typechecked, built and
checked by its CI on every change. And CI makes each kind of app with the built
`create-nisc`, outside the repository, installs it from the packed packages
under pnpm's strict resolution, and typechecks, checks and builds it
(`pnpm check:create`). A new app starts from something that works today.

## License

Apache-2.0
