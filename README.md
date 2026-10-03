# Nisc

### Stop reading what your agent wrote.

**Nisc is the AI-native app framework.** A Nisc application is not code. Its screens, queries, writes, permissions and automations are JSON documents — each one parsed by a schema, each one run by a runtime that refuses anything else. Your coding agent builds the app by writing data. You review a diff of data.

[![npm](https://img.shields.io/npm/v/@niscorp/nisc?style=flat-square&label=nisc&color=black)](https://www.npmjs.com/package/@niscorp/nisc)
[![Verify](https://img.shields.io/github/actions/workflow/status/moccadroid/niscorp/verify.yml?branch=main&style=flat-square&label=verify)](https://github.com/moccadroid/niscorp/actions/workflows/verify.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-black.svg?style=flat-square)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.12-339933.svg?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?style=flat-square)](https://www.typescriptlang.org)

```bash
npm create nisc
```

[The whole app](#the-whole-app) · [What you stop writing](#what-you-stop-writing) · [Built for the agent](#built-for-the-agent-that-builds-it) · [Packages](#packages) · [Built with it](#built-with-it) · [Showroom](#showroom) · [Working on Nisc](#working-on-nisc)

---

## The whole app

Three questions — where it goes, where its shell runs, what draws the screen — and you have this. It is the application `npm create nisc` writes, with the layout shortened and the component kit, the catalog, the canvas and the boot left out:

```ts
// src/app/actions/surfaces/welcome.action.ts — what the screen knows and does
export const welcomeAction: ActionDefinition = {
  id: 'welcome',
  title: 'Welcome',
  data: { name: 'my-app', presses: 0 },
  layout: welcomeLayout,
  triggers: [{ event: 'ui:click', ref: 'press', do: [{ increment: 'presses' }] }],
};
```

```ts
// src/app/actions/surfaces/welcome.layout.ts — what it looks like
export const welcomeLayout: LayoutNode = {
  component: 'Page',
  children: [
    { component: 'Heading', children: '{{$.name}}' },
    {
      component: 'Row',
      children: [
        { component: 'Button', ref: 'press', props: { label: 'Press' } },
        { component: 'Text', children: 'Presses: {{$.presses}}' },
      ],
    },
  ],
};
```

```ts
// src/app/charter/charter.ts — who it exists for
export const charter: Charter = {
  public: ['welcome'],
};
```

```ts
// src/app/app.ts — the app
export const app = defineApp({ charter, assignments, actions, shell });
```

No component. No handler. No route. No `fetch`. `npm run dev`, and:

- the first screen **arrives as markup**, drawn on the server by your own kit, and the page picks it up;
- the press is counted **in a shell on the server**. The browser draws what the socket sends and sends back what was pressed. Once people sign in, that shell is durable: one per person, across every tab they have open;
- a database is already there (Postgres compiled to WebAssembly in dev; hand it a real pool to deploy, and nothing else changes);
- `npm run check` boots the real server, serves the screen, draws the page and presses the button — headless, no browser, no mocks.

Then it grows the same way. A read is data:

```ts
export const todosOpen: SeedEntry = {
  fingerprint: 'todos/open',                       // the name every screen replays
  intent: 'List open todos ordered by due date',
  shape: [{ todo_id: '', title: '', due_date: '' }],
  dsl: {
    from: ['todos'],
    fields: [{ field: 'todos.id', as: 'todo_id' }, 'todos.title', 'todos.due_date'],
    filter: { eq: ['todos.done', false] },
    sort: [{ field: 'todos.due_date', dir: 'asc' }],
  },
};
```

A screen asks with `{ fingerprint, context }` and nothing else. No SQL crosses the wire, none is concatenated, and which rows come back is decided by a policy the query's author — human or model — cannot see and cannot forge. A write is the same thing with a statement in place of a query. A permission is a line in the charter. A transform is a [Prism](packages/prism) config. A form is a schema.

## What you stop writing

| You stop writing | Because |
|---|---|
| **Feature components** | A screen is a JSON layout over a kit of domain-blind primitives. The kit is the only renderer code in the app, and a different look is a different stylesheet over the same layouts. |
| **API handlers and SQL** | Reads and writes are entries in a closed grammar, replayed by name. An unknown name is an error, never a query somebody made up. |
| **`if (user.role === …)`** | An action a person is not granted **does not exist** in their shell. The warehouse kiosk granted two actions is not a locked-down app; it is a two-action app. There is nothing else to render, invoke or attack. |
| **Client state and cache invalidation** | The shell is the state, and it lives on the server. A read marked `reactive` answers again, on every screen that has it open, when a write lands on a table it reads. |
| **A second app for the terminal** | The same shell streams to React, Vue, plain DOM, a line REPL or a full-screen TUI. One wire, one session; the server never learns which one drew the frame. |
| **"Does this page need a server?"** | `nisc build` reads the answer off the actions on each path, and tells you why. |
| **Migration glue** | Tables and stored documents are stamped and move through one ledger. A document newer than its reader is refused, never guessed at. |

That last-but-one row, as the build prints it:

```
  Route   What        Served as  Because
● /       the app     server     auth.login: a person can act on it
                                 auth.login: it calls the function endpoint "enter", which is code
○ /about  page about  file       nothing on it can still happen

○  file    drawn once, for nobody in particular; nothing on it can still happen
●  server  something on it can still happen; it wants moss behind it
```

Nothing configured that verdict. It is what the app is.

And an app signed in to from a terminal — Relay, the same shell its browser draws:

```
── main ────────────────────────────────
Sign in to Relay
[1] ⟨alex, jordan or sam⟩
[2] (Send magic link)
› alex
› 2
Magic link sent to alex@relay.app. The email is faked — the link is right here:
[1] (Open magic link)
```

## Built for the agent that builds it

A language model is bad at unbounded code and very good at a constrained grammar. Give it a schema and it behaves. SQL made that trade in 1974; Nisc makes it for the rest of the application.

So the agent gets grammars, and it gets the rules with them:

- **The rulebook ships in the package.** Every app carries an `AGENTS.md` pointing at `node_modules/@niscorp/nisc/AGENTS.md` — the rules for exactly the version installed: what is data and what may be code, the five decisions that are yours and never the agent's, the order of work, what a review checks. [Read it](AGENTS.md); it is the best description of Nisc there is.
- **Decisions are asked, not guessed.** A new app comes with a `PLAN.md`: what was decided when it was made, and everything still open written down as open. Nothing gets built on an open decision.
- **Wrong is refused, not rendered.** A layout that does not parse does not draw. A charter whose deny matches nothing does not boot — a silent deny is an unprotected table. A grammar change without a migration does not pass CI.
- **Every feature ships its proof.** A check boots the real app, dispatches real events and asserts on the live tree, one `[pass]`/`[fail]` line at a time. The agent runs it in a loop; you read the lines.

What is left for you to read is small and it is all data: an action, a layout, a query, a line of policy. If a change makes the app less declarative, less validated or less observable, it is wrong even if it works.

## Quick start

```bash
npm create nisc my-app
cd my-app
npm install
npm run dev
```

| | |
|---|---|
| `npm run dev` | the app in vite, its server inside |
| `npm run build` | bundle, draw every path, say how each is served |
| `npm start` | serve the built app, every first screen drawn for whoever asks |
| `npm run export` | an app in the page only: the site as a folder for any static host |
| `npm run check` | the app's checks, headless |

`create-nisc` asks where the shell runs — **on a server** ([moss](packages/moss): one shell per person, the charter enforced there) or **in the page** (offline, static hosting, no backend; the charter is then honest UI and not a security boundary) — and whether **React** or **plain DOM** draws the screen. Flags answer the questions: `npm create nisc my-app -- --page --dom`.

Then open `PLAN.md`, and hand the folder to your agent.

> Requires Node ≥ 22.12. Every piece also installs on its own — `npm i @niscorp/prism` is a JSON transform engine and nothing else.

## Packages

Eleven libraries, a command, a release that pins them together, and the thing that makes a new app. All on npm. Each library stands alone; they also compose.

| | Package | What it is |
|---|---|---|
| 🎨 | [**`@niscorp/nova`**](packages/nova) | The UI runtime. Shells host canvases, canvases host actions, actions render JSON layouts. A surface-blind core with adapters for React, Vue, plain DOM, a tty and Ink. |
| 🌿 | [**`@niscorp/moss`**](packages/moss) | The app server. A `defineApp` manifest becomes one application per principal: a resolved catalog, scoped data, a durable server shell streamed to a thin terminal, first screens drawn into the page, pages written as files. |
| 🔍 | [**`@niscorp/vex`**](packages/vex) | Queries and mutations as data. Intent → a constrained JSON DSL → SQL, cached by fingerprint and replayed by name, with scope policies the author cannot see and semantic (vector) search. |
| 💎 | [**`@niscorp/prism`**](packages/prism) | Every transform. A JSON DSL of ~75 ops, compiled, fingerprint-cached, with zero code execution. Also the language migrations are written in. |
| 📜 | [**`@niscorp/charter`**](packages/charter) | The policy document. Roles are glob selections over what exists — actions, data verbs, layouts — resolved per principal, with a verifier that refuses an incoherent charter before it ships. Zero dependencies. |
| 🪨 | [**`@niscorp/strata`**](packages/strata) | Versions. Tables as ledgered migration sequences; stored documents stamped and upgraded on read; a CI gate for grammar changes; `strata upgrade` for artifacts in source. |
| 🧵 | [**`@niscorp/loom`**](packages/loom) | Schema → editing UI. Compiles a Zod schema into a Nova form that views, creates and edits valid JSON. |
| 🌊 | [**`@niscorp/tide`**](packages/tide) | Automation. A reflex turns the clock and a fact into one named effect, through a durable ledger. No run body, no wall clock. |
| 🧠 | [**`@niscorp/cortex`**](packages/cortex) | The agent runtime. One tool loop, typed envelopes, gates, human-in-the-loop confirmation, streamed events. |
| 📡 | [**`@niscorp/signal`**](packages/signal) | The LLM client. Stateless, immutable, provider-agnostic. Today that means OpenAI, Groq and OpenRouter through one OpenAI-compatible adapter; native Anthropic and Google adapters are not built yet. Structured output through Zod, tool calling, validation-retry. |
| 🧊 | [**`@niscorp/solid`**](packages/solid) | Structured output, streamed. An always-valid, schema-backed object over partial JSON, so a model's answer can be drawn while it is still arriving. |
| ⌨️ | [**`@niscorp/cli`**](packages/cli) | The `nisc` command: `dev`, `build`, `export`, `start`, `check`. One config file says how the app boots and how a screen is drawn; the rest is read off the app. |
| 📦 | [**`@niscorp/nisc`**](packages/nisc) | The release. Ships no code: pins every package above to the exact version it was tested with, and carries the rulebook for that set. |
| ✨ | [**`create-nisc`**](packages/create-nisc) | `npm create nisc`. Four templates that are themselves real, checked apps. |

> Each library has a `README.md` and a `DESIGN.md`. **Read the design doc before the source.**

## Built with it

The reference apps in [`apps/lab`](apps/lab), each built by the rulebook and each proving something different:

| App | What it is | What it proves |
|---|---|---|
| [**atrium**](apps/lab/atrium) | A guest-and-staff platform for hotels: two hotels on two different PMS backends, five audiences, one URL. | Shipping is a row write. Integrations arrive over HTTP from the vendor's own service and become actions, queries and menus as rows. The exemplar. |
| [**lyra**](apps/lab/lyra) | A membership platform for studios and gyms. One deployment, many studios. | Actions are the product and layouts are disposable: a studio's whole look is rows, replaced by action id, revertibly. |
| [**lyceum**](apps/lab/lyceum) | The app a talk about Nisc runs on — slides, projector, the speaker's controller, the audience's phones and terminals. | One shell per person, live, in a room full of them. |
| [**encore**](apps/lab/encore) | A festival's operations room with no navigation: the operator types what is happening, and the room assembles around the sentence while it is being typed. | A fast model that selects among the actions a person already has. It picks, it never invents, and it never presses the button. |
| [**relay**](apps/lab/relay) | A CRM that runs in a browser, a tty, an Ink TUI and a browser extension. | One app, every terminal. |
| [**mythos**](apps/lab/mythos), [**fable**](apps/lab/fable) | Apps with no server: the shell, the database and the endpoints all live in the page. | The same artifacts with nothing behind them. Mythos is exported as a folder: every path a file, its first screen already in it. |

## Showroom

**→ [moccadroid.github.io/niscorp](https://moccadroid.github.io/niscorp/) — every library, live in your browser. No install.**

Stories render beside their JSON definitions, runtime data and error states. Vex runs against a real Postgres compiled to WebAssembly, so intent → query → SQL, vector search and scope policies all work end to end with no backend — the canned stories with no key at all, an intent of your own with a model key of yours.

```bash
pnpm --filter showroom dev
```

## Principles

Five rules every package obeys. They are load-bearing.

1. **JSON is the shape.** Layouts, transforms, queries, policies, plans — plain JSON: serializable, diffable, cacheable, storable, emittable by a model. The moment something wants to be a code string, we stop and ask why.
2. **Zod is the truth.** Everything that crosses a boundary is parsed at that boundary. A provider's schema is a compliance hint; Zod is the truth. Errors are structured, and in a model loop they go back to the model.
3. **Declarative is observable.** If the thing to execute is data, the runtime can inspect it, log it, gate it, replay it, cache it, dry-run it and send it over a wire. Imperative code gives you none of that.
4. **Zero-risk execution.** Model-written artifacts are untrusted by default. No `eval`, no generated TypeScript, no SQL concatenation, no tool call without a policy check. If you can inject code into a Nisc runtime, that is a bug — report it.
5. **No lock-in.** Nova's core does not import React. Signal has no vendor SDK as a hard dependency. Prism is a pure function. Use any one piece alone.

## Working on Nisc

```bash
git clone https://github.com/moccadroid/niscorp.git
cd niscorp
pnpm install
pnpm build
```

> Node ≥ 22.12 and pnpm (`corepack enable`).

```bash
pnpm test          # unit tests, every package
pnpm typecheck     # tsc --noEmit across the workspace
pnpm format        # prettier

# the gates CI runs (after pnpm build) — `pnpm verify` runs all but the last, which CI runs on pull requests
pnpm check:packages    # every package packed and installed OUTSIDE the workspace: publint, attw, every subpath imported
pnpm check:create      # each kind of app made with the built create-nisc, installed, typechecked, checked and built
pnpm check:grammars    # nova's and Prism's schemas vs their snapshots; 157 real documents must upgrade and parse
pnpm check:sources     # each lab app's source is written at the grammars it runs on (strata.lock.json)
pnpm check:changesets  # a breaking release breaks everything that depends or peers on it
```

One package at a time:

```bash
pnpm --filter @niscorp/nova test
pnpm --filter @niscorp/nova dev      # tsup --watch
```

**Versions.** Every package versions on its own line; `@niscorp/nisc` is the release that pins them together. A change to a package ships with a changeset (`pnpm changeset`). Below 1.0 **a minor is breaking**, and a breaking release breaks everything that depends or peers on it — `pnpm check:changesets` says which lines to add. A changeset is not a release: the Release workflow keeps a *release: version packages* pull request open, and merging it publishes — from CI, through npm's trusted publishing, with provenance and no stored token. The whole sequence is [docs/releasing.md](docs/releasing.md).

**Dependencies.** A plain `dependency` is used only inside a package — never in its published types, never authored by the app. What crosses the API, or evaluates an app's artifacts (zod, every nisc→nisc edge), is a required **peer**, so an app has one copy. What only one subpath uses (react for an adapter, `/agent`, `/hono`) is an **optional** peer. zod's floor is 4.2.0. `check:packages` enforces all of it.

**The rulebook.** [AGENTS.md](AGENTS.md) and [STYLE_GUIDE.md](STYLE_GUIDE.md) at the root are links to `packages/nisc/`, where they live because they ship. Changing a rule is a change to that package: it takes a changeset, and reaches apps as a release.

**Tables and grammars.** No package runs DDL outside a [strata](packages/strata) sequence, and changing a schema behind a document kind (nova's actions and layouts, Prism's config) is a migration on that grammar — the gate refuses it otherwise. Applied migrations, recorded snapshots and early-stamp corpus files are history: append, never edit. The rules for apps are [AGENTS.md](AGENTS.md) 17–20.

```
niscorp/
├── packages/        the eleven libraries, cli, nisc (the release), create-nisc (and its four templates)
├── apps/
│   ├── showroom/    live demo + inspector, a module per library
│   └── lab/         the reference apps
├── docs/            releasing.md, plans/ (build briefs; plans/README.md has each one's status), archive/
├── strata/          the grammar gate's records: snapshots/, corpus/
├── scripts/         the check:* gates
└── .changeset/      pending release notes
```

## Status

Nisc is on npm and **pre-1.0**. Everything in the table above is built, tested and in use by the reference apps. Public APIs are not frozen: below 1.0 a breaking change is a minor version, announced in its changeset. The data does not break silently — tables and documents move through [strata](packages/strata) migrations.

## Contributing

Issues and pull requests welcome. Read the package's `DESIGN.md` before proposing anything bigger than a bug fix — the architecture has opinions, and the opinions are the product.

## License

[Apache-2.0](LICENSE) © Nisc contributors. Fork it; it is yours.
