# Nisc

### An AI-native application platform.

**Software, if you let machines write it, shouldn't be code.**

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-black.svg?style=flat-square)](LICENSE)
[![Status](https://img.shields.io/badge/status-pre--1.0-orange.svg?style=flat-square)](#status)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-f69220.svg?style=flat-square)](https://pnpm.io)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.12-339933.svg?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?style=flat-square)](https://www.typescriptlang.org)
[![Live Showroom](https://img.shields.io/badge/Live_Showroom-moccadroid.github.io-4f46e5.svg?style=flat-square)](https://moccadroid.github.io/niscorp/)

[Packages](#packages) · [Philosophy](#philosophy) · [Quick start](#quick-start) · [Showroom](#showroom) · [Status](#status)

### ▶ Try it live — [moccadroid.github.io/niscorp](https://moccadroid.github.io/niscorp/)

Every package, running in your browser. No install. Vex even synthesizes SQL against a **real Postgres compiled to WebAssembly** — so English→query→SQL, vector search, and scope policies all work end-to-end with no backend.

---

> Nisc is a monorepo of small, opinionated libraries built around a single thesis:
> **the next generation of software will be authored by language models, audited by humans, and executed by runtimes that refuse to run anything that isn't a validated tree of data.**

Not "AI tools." Not "copilots." A stack where every layer — UI, data transforms, LLM calls, orchestration, queries — is a declarative JSON artifact a model can emit, a schema can validate, a runtime can walk, a cache can fingerprint, and a human can diff.

No `eval`. No generated TypeScript. No SQL string concatenation. No prompt-injected shell-outs.
The machines stop typing code and start emitting structure.

If that sounds austere: good.

## Packages

Eleven libraries, and one release that pins them together. Each library is self-sufficient. They also compose.

| | Package | Description | Status |
|---|---|---|---|
| 📡 | [**`@niscorp/signal`**](packages/signal) | Universal LLM client — stateless, immutable, provider-agnostic. Structured output via Zod, tool calling, validation-retry. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 🧊 | [**`@niscorp/solid`**](packages/solid)   | Structured output streaming — incremental JSON parser with structural sharing. Always-valid, schema-backed object stream over partial JSON. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 💎 | [**`@niscorp/prism`**](packages/prism)   | JSON data-transformation DSL — ~75 ops (including the transform ops migrations are written in), compile-time optimization, fingerprint-keyed cache, zero code execution. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 🎨 | [**`@niscorp/nova`**](packages/nova)     | Declarative UI runtime — JSON layouts, actions, lifecycles, two-way bindings. Framework-agnostic core, React adapter shipped. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 🧠 | [**`@niscorp/cortex`**](packages/cortex) | Agentic orchestration runtime — typed agents, tool-call loop, plan-mode tick loop, declarative rules engine, human-in-the-loop confirmation. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 🔍 | [**`@niscorp/vex`**](packages/vex)       | Declarative query synthesis — English → constrained JSON DSL → SQL, with semantic (vector) search, scope policies, and shape-based caching. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 🧵 | [**`@niscorp/loom`**](packages/loom)     | Schema → editing UI — compiles a Zod schema into a Nova form that views, creates, and edits valid JSON. Headless compiler plus a plugin host with live preview. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 🌊 | [**`@niscorp/tide`**](packages/tide)     | Automation engine — a reflex turns the clock and the fact into one named effect, through a durable ledger. No run body, no wall clock, five host seams. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 📜 | [**`@niscorp/charter`**](packages/charter) | Policy documents — roles as glob selections over opaque universes (actions, data verbs, layouts), resolved per principal; a verifier that refuses an incoherent charter before it ships. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 🌿 | [**`@niscorp/moss`**](packages/moss)     | The app server — a `defineApp` manifest becomes per-principal applications: resolved catalogs, scoped data, durable server shells streamed to a thin terminal (React, DOM, tty, ink). | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 🪨 | [**`@niscorp/strata`**](packages/strata) | Versions — every stored document stamped and upgraded on read (or refused when newer than its reader), a CI gate for grammar changes, `strata upgrade` for artifacts in source, and the tables they live in as ledgered migration sequences. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |
| 📦 | [**`@niscorp/nisc`**](packages/nisc)     | The release — ships no code; pins every package above to the exact version it was tested with. | ![](https://img.shields.io/badge/-shipping-22c55e?style=flat-square) |

> Each package ships its own `README.md` and `DESIGN.md`. **Read the design doc before reading the source.**

## Philosophy

Five rules every package obeys, without exception. They're load-bearing.

### 1 · JSON is the shape

Layouts, transforms, queries, plans — all plain JSON. Serializable, diffable, cacheable, persistable, LLM-emittable. The moment something wants to be a code string, we stop and ask why.

### 2 · Zod is the truth

Every external input is parsed before it touches a runtime. Provider schemas are compliance hints; Zod is the truth. Errors are structured and, in LLM loops, fed back to the model.

### 3 · Declarative = observable

If the thing-to-execute is data, the runtime can inspect, log, gate, replay, fuzz, cache, dry-run, and ship it over the wire. Imperative gives you none of that.

### 4 · Zero-risk execution

LLM-generated artifacts are untrusted by default. No `eval`, no SQL concat, no tool call without a policy check. If you can inject code into a Nisc runtime, it's a bug — file the report.

### 5 · No framework lock-in

Nova has a React adapter; its core doesn't import React. Signal has no vendor SDK as a hard dep. Prism is a pure function. Use any one piece standalone — they don't phone home.

### Why JSON. Why now.

LLMs are structurally bad at unbounded code and structurally excellent at constrained grammars. Give them a schema and they behave. SQL solved this in 1974; we're doing it one layer up.

## Quick start

```bash
git clone https://github.com/moccadroid/niscorp.git
cd niscorp
pnpm install
pnpm build
```

> **Requires** Node ≥ 22.12 and pnpm. Install pnpm with `brew install pnpm` or `corepack enable`.

## Showroom

**→ [moccadroid.github.io/niscorp](https://moccadroid.github.io/niscorp/) — live in your browser. No install.**

A demo + inspector for every package: stories render side-by-side with their JSON definitions, runtime data, and error states. Vex runs a real Postgres (PGlite/WebAssembly) in the browser, so English→SQL synthesis, vector search, and shape-caching all work end-to-end with no server.

Run it locally:

```bash
pnpm --filter showroom dev
```

→ http://localhost:5173

If the showroom complains about missing `dist/`, warm the caches once: `pnpm --filter showroom... build`.

## Development

```bash
pnpm build         # turbo build
pnpm test          # turbo test
pnpm typecheck     # tsc --noEmit across the workspace
pnpm lint          # turbo lint
pnpm format        # prettier write

# the gates CI runs (after pnpm build)
pnpm check:packages    # every package, packed and installed OUTSIDE the workspace: publint, attw, every subpath imported
pnpm check:grammars    # nova's and Prism's schemas vs their snapshots; 157 real documents must upgrade and parse
pnpm check:sources     # each lab app's source is written at the grammars it runs on (strata.lock.json)
pnpm check:changesets  # a breaking release breaks everything that depends or peers on it
```

Working on one package? Filter it:

```bash
pnpm --filter @niscorp/nova test
pnpm --filter @niscorp/nova dev      # tsup --watch
```

## Working on the packages

**Versions.** Every package versions on its own line; `@niscorp/nisc` is the
release that pins them together. A change to a package ships with a changeset
(`pnpm changeset`). Below 1.0 **a minor is breaking**, and a breaking release
breaks everything that depends or peers on it — `pnpm check:changesets` says
which lines to add. A changeset is not a release: the Release workflow keeps
a *release: version packages* pull request open, and merging it publishes —
from CI, through npm's trusted publishing, with provenance and no stored token.
The whole sequence, the first release included, is
[docs/releasing.md](docs/releasing.md).

**Dependencies.** A plain `dependency` is used only inside a package — never in
its published types, never authored by the app. What crosses the API, or
evaluates an app's artifacts (zod, react, every nisc→nisc edge), is a required
**peer**, so an app holds one copy. What only one subpath uses (`/agent`,
`/hono`) is an **optional** peer. zod's floor is 4.2.0: from there a schema
converts itself (`~standard.jsonSchema`), whichever copy made it.
`check:packages` enforces all of it.

**Tables and grammars.** No package runs DDL outside a
[strata](packages/strata) sequence, and changing a schema behind a document kind
(nova's actions and layouts, Prism's config) is a migration on that grammar —
the gate refuses it otherwise. Applied migrations, recorded snapshots and
early-stamp corpus files are history: append, never edit. The rules for apps
are [AGENTS.md](AGENTS.md) 17–20; the whole plan is
[docs/plans/versioning.md](docs/plans/versioning.md).

## Repo layout

```
niscorp/
├── packages/
│   ├── signal/     📡  universal LLM client
│   ├── solid/      🧊  structured output streaming
│   ├── prism/      💎  JSON transform DSL
│   ├── nova/       🎨  declarative UI runtime
│   ├── cortex/     🧠  agentic orchestration
│   ├── vex/        🔍  query synthesis
│   ├── loom/       🧵  schema → editing UI
│   ├── tide/       🌊  automation engine
│   ├── charter/    📜  policy documents
│   ├── moss/       🌿  the app server
│   ├── strata/     🪨  versions: ledger, grammars, source upgrade
│   └── nisc/       📦  the release (pins the set)
├── apps/
│   ├── showroom/        live demo + inspector (a module per package)
│   └── lab/             reference apps built by AGENTS.md (atrium, relay, lyra, …)
├── strata/              the grammar gate's records: snapshots/, corpus/
├── scripts/             the check:* gates
├── .changeset/          pending release notes
├── pnpm-workspace.yaml
└── turbo.json
```

## Status

Nisc is **pre-1.0** and under active design.

- **All eleven packages** are tested and usable (Vex included — its engine, Postgres adapter, and reference agents are real and demoed live in the showroom), but their public APIs are not frozen, and none is on npm yet.
- Below 1.0 a breaking change is a minor version, announced in its changeset — and whatever depends on it breaks with it. The data does not break silently: tables and documents move through [strata](packages/strata) migrations.

## Contributing

Issues and PRs welcome. Read the relevant package's `DESIGN.md` before proposing anything bigger than a bug fix — the architecture has opinions, and the opinions are the product.

> If a change makes the runtime **less observable**, **less validated**, or **less declarative**, it's probably going the wrong way.

## License

[Apache-2.0](LICENSE) © Nisc contributors

_Built with deliberate constraint. Powered by JSON._
