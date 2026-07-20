# Building an application on nisc

For agents generating or reviewing a nisc application. The package READMEs and DESIGN docs document the libraries — read them before using one. This file states the application-level rules they don't cover, and it stands alone: it assumes the nisc packages and nothing else.

## The thesis

Everything the app does is data with a schema. An action is JSON. A layout is JSON. A transform is JSON. A query is JSON. A mutation is JSON. A charter is JSON. A plan is JSON. Each artifact is validated by a Zod schema at the boundary and executed by a runtime; nothing executable is a code string. Imperative TypeScript exists only at the edges, and only as:

1. a **renderer primitive** — a registry component: props in, events out;
2. an **endpoint** — real data access behind a URL or registered function;
3. **setup** — manifest assembly, registry assembly, boot;
4. **authored data** — an `ActionDefinition`, a Prism config, a Zod schema: data written in TS for type-checking, serializable as-is;
5. a **check** — a `dev/` script driving the real shell to assert behavior.

Code that is none of these — a React feature component, a fetch-and-massage helper, an inline formatter — is a discipline break.

The mental model for the UI: **shells host canvases, canvases host stacks of actions, actions render JSON layouts.** There are no screens. Chrome, lists, forms, dialogs, dashboards — all of them are actions loaded onto canvases. How actions are arranged across canvases is a design choice.

By default the shell runs on the server: the app is a `defineApp` manifest handed to moss, which builds one durable shell per principal and streams rendered trees to a thin canvas terminal. Client execution — the shell in the browser, built by the app's own factory — is an explicit degrade for offline and zero-backend apps (D1), not a mode menu.

## Decisions are the user's

This document has **rules** and **decision points**. Rules you follow without asking. Decision points are choices nisc deliberately leaves open — **never resolve one silently**. Present the options, the tradeoffs, and a recommendation, then wait for the answer. Decide alone only when you hold all the information an informed decision needs — for architecture questions you almost never do.

Collect the answers **before implementation starts**. The build is meant to run as an implement/check loop, and a loop that stops mid-flight to ask questions isn't running — front-loading the decisions is what lets it run to done. The known decision points:

- **D1 — Posture.** A moss server app (default: the shell runs server-side, the client is a canvas terminal) or a client-degrade app (the shell runs in the browser — offline, zero-backend, portable). The degrade is explicit, per app or per canvas.
- **D2 — Environment.** What the runtime is handed: the database (PGlite for dev and demos, Postgres for real), a cache backend, a session verifier. For a client-degrade app: what serves the endpoints — in-memory fixtures, PGlite, a real backend, mixed.
- **D3 — Reads.** Vex query endpoints, or plain endpoints with hand-written handlers. *Whether* to use Vex is the decision; *how* is fixed (see "Using Vex").
- **D4 — Writes.** Vex mutation entries — the closed grammar, authored like reads and replayed as `{ fingerprint, context }` — or plain endpoint handlers. Either way a write is an endpoint; nothing writes inline.
- **D5 — Routing.** Whether shell state syncs to the address bar.

Any other fork not covered by a rule gets one of two treatments. A genuine open choice is surfaced like a decision point. A choice that plainly follows from answers already given — the canvas arrangement implied by the views, one form per entity, delete-with-confirm — is **derived**: recorded in `PLAN.md` for review, not asked. When in doubt, ask.

Conflicts get the same treatment too: when this document, a package README, and the code disagree, one of them has rotted — report the discrepancy, don't guess which one is right.

## Before any code: the interview

Step one of every build is a conversation, not a scaffold. Ask the user one batched round of questions and record every answer in `PLAN.md` before writing anything else:

- **The decision points D1–D5**, each with options, a recommendation, and the consequences spelled out. Consequences are the point: "a browser database" is not an answer a user can evaluate — "your data lives in one browser profile: no sync, no other devices, gone if site data is cleared" is.
- **The dial-in:** which entities and relationships; expected scale; who uses it (a single principal, or roles — a multi-principal app sketches its roles and charter in the interview, not after); AI features (now, later, never — this shapes D3); look and feel; deployment target; what happens to the data long-term.

Rules of the interview:

- **Front-load everything.** Sweep the brief against D1–D5, the rules, and the order of work, and ask it all in one round. The goal is zero questions after the build starts; a fork that surfaces mid-build still gets asked, but treat it as a defect of your interview, not as routine.
- **Every choice lands in `PLAN.md` with its tier**: **answered** by the user, **delegated** by name ("D4: delegated"), or **derived** — it plainly follows from answers already given and is recorded for review, not asked. A blanket "go" or "you decide" delegates nothing. A choice that fits none of the three tiers blocks the build.
- If an answer implies a constraint the user didn't name (multi-user later → roles and scope rules now; AI later → keep reads Vex-shaped now), say so during the interview, not in a commit message.

## The toolbox

Pick per need; every piece works standalone. Nova is the only mandatory one for an app with a UI; moss is the default host for one with a server (D1).

| Package | Use it for | Don't use it for |
|---|---|---|
| `nova` | the UI: shells, canvases, actions, layouts, fragments | — |
| `moss` | the app server: `defineApp` manifest + runtime → data layer, per-principal policy and catalogs, server shells, the socket, and the canvas terminal (`/terminal` + render targets) | client-degrade apps — they wire their own shell |
| `charter` | the policy document: roles → glob selections over the app's universes, resolved per principal, verified at boot | enforcement — the governed target enforces |
| `prism` | every transform: shaping, formatting, branching | anything a schema or layout expresses directly |
| `vex` | query and mutation endpoints: `{ fingerprint, context }` → rows or effects (see "Using Vex") | writes outside its closed mutation grammar |
| `loom` | compiling a Zod schema into an editing form — prefer it over hand-laying a form the schema already describes | layouts that aren't schema-backed documents |
| `signal` | LLM calls | — |
| `cortex` | agents, tools, orchestration | — |
| `solid` | streaming structured LLM output into UI | — |

## Rules

**Actions**

1. Everything visible is an action (`.action.ts`) + JSON layout (`.layout.ts`) loaded onto a canvas. No React views, no app logic in components.
2. One component registry, assembled once. Primitives are domain-blind: a component name containing a domain noun (`InvoiceRow`, `DealCard`) is a feature component in disguise — wrong. Repeated structure is a data-driven spec prop on a generic primitive (a `Table`'s `columns`), not a new component. A component never imports the shell, actions, or data code; if it needs domain knowledge to render, compute the field upstream in a transform.
3. Reusable chrome (dialog frame, panel, drawer) is a fragment composed when an action is loaded (`with: [...]`), not a wrapper component. Modality is arrangement — an action loaded onto an overlay canvas with fragment chrome — never a `$.modalOpen` flag inside an action.
4. Shell state is the truth. Routing (D5), if wired, is a data table mapping paths ↔ actions, synced by an adapter; Nova stays URL-agnostic.

**Data**

5. All data in and out of an action flows through its declared `endpoints`. Shaping is declared on the endpoint: a static request body is plain JSON; a body derived from the action's data is a Prism config, kept in a sibling `.prism.ts`. Prefer plain JSON when no mapping is required. Components never shape data.
6. Nova doesn't know Prism: the shell's injected `transform` is the socket that makes Prism endpoint configs work. Wire it once in setup, and fold ambient app context (the app's "today", the session's principal) into the source there — per session on the server under moss, in the shell factory in a client-degrade app — never into per-action data.
7. An endpoint is a contract, not an implementation (D1, D2). In-browser, server, or mixed — actions can't tell the difference, and must not be able to. Server functions are endpoints too: the manifest's `functions(session)` seam runs them in-process under the caller's policy. A client-side `fn` registry is the escape hatch for client-degrade apps, and discouraged elsewhere.
8. Writes are endpoints fired by triggers, never inline mutations (D4). Identity and tenancy are stamped server-side from the session, never client-supplied: a form never carries `owner_id`.
9. Formatting and derivation live in Prism transforms, never in components and never in action code.

**Principals**

10. The charter is the app's policy document: role names → glob selections over the app's universes — `actions` (which action ids exist for a principal) and `data` (`table.verb` capabilities, compiled into the Vex `ScopePolicy`). The charter compiles; it never enforces and never shapes. Moss resolves it per principal and refuses to boot incoherent. Assignments (principal → roles) are app data beside it; row-level semantics the charter can't express are `behaviors`, compiled into the policy.
11. Per-principal UI is existence or a served variant, never a conditional. An action a principal lacks does not exist in their shell (ring 1); a different shape of the same action is a served variant (ring 2). Layouts and components never branch on roles or capability data. The manifest's `inputs` hook seeds per-principal boot data; branching chrome on it is a stopgap where a served variant doesn't exist yet.
12. Auth is a session token, nothing else — magic link is the default strategy. Login is the anonymous principal's application; `session.grant` and `session.signout` are reserved shell channels; the server consumes sessions and never mints identity.

**Schemas**

13. Everything that crosses a boundary is parsed by a Zod schema at that boundary. `.strict()` on external input.
14. An action's openable inputs live in its definition's optional `input` field: a JSON Schema — authored in Zod with `.describe()` on every field, converted with `z.toJSONSchema` — of the `data` keys an opener may seed when loading the action. The fields are a subset of `data`; no seedable keys, no `input`. That schema is the action's public contract, for a nav item, a URL, a command palette, and an agent alike. Catalogs curate ids and descriptions and are resolved per principal (moss serves the resolved catalog); they read `input` off the definition, never restate it.
15. For any LLM contract, the Zod schema is the single source of truth: constraints in `.describe()`, JSON Schema injected into the prompt at runtime, always minified. No prose "how the DSL works" sections in prompts.

**Code**

16. `/STYLE_GUIDE.md` applies in full. Zero-tolerance: `any`, type assertions (`as` — `as const` excepted), non-null `!`, `enum`, classes, default exports, `function` declarations. Deps via `pnpm add` only. Files: `kebab-case.role.ts`. Declared exception: a file that must match an external module's shape (a shim) may break these rules — it says why in a header comment, and reviewers honor it.

## Using Vex

Whether to use Vex is D3 (reads) and D4 (writes). How to use it is not a choice:

- **Reads the app depends on are deterministic.** Author each one as a cache entry — Vex's own cache row minus the machine-filled bits:

```ts
import type { OkCacheEntry } from '@niscorp/vex';

type CacheEntry = Pick<OkCacheEntry, 'shape' | 'dsl' | 'intent'> & { fingerprint: string; mapping?: unknown };

export const todosOpen: CacheEntry = {
  fingerprint: 'todos/open',                            // THE cache key — the name every read replays
  intent: 'List open todos ordered by due date',        // one factual sentence — mandatory
  shape: [{ todo_id: '', title: '', due_display: '' }], // drives the array-vs-single envelope on replay
  dsl: {                                                // hand-authored; { $context: 'key' } for parameters
    from: ['todos'],
    fields: [{ field: 'todos.id', as: 'todo_id' }, 'todos.title', 'todos.due_date'],
    filter: { eq: ['todos.done', false] },
    sort: [{ field: 'todos.due_date', dir: 'asc' }],
  },
  mapping: { /* Prism over { result: rows }; omit when the DSL already aliases to the shape */ },
};
```

- **Writes are mutation entries in the same store.** `kind: 'mutation'`, a statement in the closed mutation grammar in place of a query DSL, the same wire shape (`{ fingerprint, context }`). Mutations are replay-only forever — never generated; `lintMutation` runs at seed, and context signatures are derived for discovery.
- **Under moss (the D1 default), hand the entries to `defineApp({ entries })`.** The server derives the data layer: boots the engine, prewarms protected, serves locked replay-only endpoints, and compiles each principal's `ScopePolicy` from the charter's `data` section. The app never touches an engine.
- **A client-degrade app boots its own engine** — database adapter + cache backend + `ScopePolicy` — `introspect()` once at startup, memoized behind a single accessor. Prewarm at boot through the cache backend's own `set()`: key = the entry's `fingerprint`, `prismIr` = `await compile(mapping ?? { $ref: '$.result' })` (`@niscorp/prism`), plus the shape, the schema fingerprint, and `protected: true` — a seeded entry can never be replaced by a stray request. Seed the identity IR for mapping-less entries explicitly — a NULL IR falls through to the LLM mapper. Throw on duplicate names while seeding.
- **The fingerprint is the cache key.** Every entry replays as `{ fingerprint, context }` — no shape, no intent on the wire. Id fields still follow `<entity>_id` (self-describing rows); never a shared `{ value, label }`.
- **The mapping owns the result shape.** Vex evaluates it over `{ result: rows }` and returns the output verbatim — array, object, or scalar; the entry's stored shape picks array-vs-single. Formatting (money, dates) lives here, in shared helpers.
- **App reads are replay-only.** Moss serves its endpoints locked; a client-degrade app passes `{ locked: true }` itself. An unknown fingerprint (a missed prewarm, a discipline break) is a 500, never a silent LLM call. With no AI features, also wire no hooks: warm-only, enforced twice.
- **Live queries are the opt-in LLM path.** Wire `createQueryDsl` / `createShapeMapper` (`@niscorp/vex/agent`) as the engine's `generateDsl` / `mapToShape` hooks; a request without a fingerprint generates, caches, and mints one (`meta.cache.fingerprint`) — embed that to replay the proven query. App reads stay locked and never depend on this path; agents and ad-hoc features do.
- **Staleness is handled through the slot.** When an entry must change, send its fingerprint with the changed request — the slot regenerates and replaces (protected entries 409 until unprotected). Don't edit cache rows by hand.
- **Scope is engine-side.** Access policy lives in the engine's `ScopePolicy` — compiled from the charter under moss — invisible to and unforgeable by query authors, human or LLM.

## Working patterns

Stack-independent conventions:

- **Action data = endpoint-fed slots + UI state**, every key with a default. Loading is explicit data (`loading: true`), not Suspense.
- **Mount loads; `onSuccess` chains dependent loads.** Each independent section of a detail action is its own endpoint into its own slot.
- **Writers announce, viewers react.** A successful write emits a channel (`<entity>s-changed`); every action displaying that entity listens and re-reads. No shared stores. Message triggers carry no payload — when a listener must know *which*, use one channel per case (`nav-home`, `nav-tasks`), not a payload.
- **One form action per entity, create and edit.** Loaded bare it creates; loaded with the record's raw fields seeded it edits. Keep raw values (numbers, ISO dates, ids) alongside `*_display` strings so forms round-trip.
- **Interaction = `ref` + trigger.** Layout nodes carry `ref`; triggers catch `{ event, ref }` and run steps. Event payloads flow via `@event.payload`; no callbacks in props.
- **Seeds choose their clock.** A seed pins a fixed reference date or shifts with the wall clock — per what the seed is for: a regression fixture pins, a demo that must look alive today shifts. Either way the app compares against injected context (`$.today`, per request under moss) — never a wall-clock read inside a transform, query, or layout.
- **The app is a manifest; only degrade shells are factories.** Under moss the app is `defineApp({...})` and the server builds one durable shell per principal — dev checks boot the same manifest with a dev runtime. A client-degrade app builds its shell as `createAppShell(deps)` with everything environmental injected, so checks construct the real app with real deps and nothing leaks between runs.

## Layout of an app

One arrangement — relay's, the exemplar. `app/` holds **artifacts only**: every file there is pure, schema-valid JSON authored in TS (a check enforces it). Code lives outside `app/` — the environment in `db/`, helpers in `lib/`, the server glue and fns in `server/`, the component kit in `ui/`.

Three naming rules make the tree legible, and they're the same rules the artifact library will type its rows by:

- **A folder names the governor** (or, for nova's many kinds, the domain): `charter/` and `vex/` group a library's artifacts; `actions/domains/<x>/` groups a domain's.
- **A suffix names the kind** — the specific artifact type, which is also its library row type: `.action.ts`, `.layout.ts`, `.fragment.ts`, `.prism.ts`, `.entries.ts`. Multi-member kinds (many files, one artifact each) carry it.
- **A single-document field is named by the field, no suffix**: `charter.ts`, `assignments.ts`, `behaviors.ts`, `resources.ts`, `app.ts`. There's only one — nothing to disambiguate. Index files that assemble a kind are named for it: `action-catalog.ts`, `layout-variants.ts`.

There is deliberately **no library suffix** (`.vex.ts`, `.charter.ts`): the suffix names the kind, not the governor — the governor is the folder. `.action.ts` is not `.nova.ts`.

```
src/
  app/                     ARTIFACTS ONLY — pure JSON, each parses its schema
    app.ts                 the defineApp manifest — one import per field
    action-catalog.ts      ring 1: the action index (actions)
    layout-variants.ts     ring 2: the minted layout-variant index (layouts)
    charter/               charter.ts, assignments.ts
    actions/               the trios — chrome/, domains/<x>/, surfaces/, shared/
                           (a variant layout sits beside its base: topbar.layout.ts + topbar.full.layout.ts)
    shell/                 the shell manifest's chrome — frame.layout, stack layouts, fragments/
    prisms/                shared authored transforms (money, dates)
    vex/                   the vex data surface (governor folder, mirrors charter/)
      <entity>.entries.ts    read + mutation entries, one file per entity
      behaviors.ts           row-level scope semantics (single doc)
      resources.ts           entity subgraphs → /api/<name>/vex (single doc)
  db/                      the environment (D2): schema DDL, seed — NOT artifacts, not in the library
  lib/                     code helpers (date, etc.)
  server/                  moss glue (boot + listener) and server fns
  ui/                      the component kit + registry — the only React in the app
  dev/                     headless checks
  main.tsx                 the terminal entry
```

Why the split: the manifest's data fields are on their way to becoming library rows (deploy = a write, not a rebuild), so keeping them pure and schema-valid now — with `db/` and `lib/` code held firmly outside `app/` — is what makes the tree row-ready. A client-degrade app replaces `server/` with whatever serves its endpoints (per D2) and boots its shell factory from the entry point.

## Order of work

1. **The interview** (see "Before any code") — every decision answered or delegated by name, recorded in `PLAN.md` with scope, data model, and roles.
2. **Scaffold** — manifest + runtime + terminal (moss), or boot + shell factory (degrade); canvases + empty registry; one placeholder action renders.
3. **Kit** — primitives against a kitchen-sink action; lock the look before any real feature.
4. **Data layer** — per D2/D3: schema, seed, entries, behaviors; prove one read end-to-end.
5. **Actions** — domain by domain: list → detail → form; chrome and routes as they're needed; new action ids granted in the charter as they're minted.
6. **Writes** — per D4, with change channels; prove one round-trip: create → announce → re-read.
7. **Checks and polish** — a dev check per feature; empty states, skeletons, transitions last.

## Verification

Every feature ships a headless check: a standalone script under `dev/` that boots the real app — for a moss app, the manifest through `createServer` with a dev runtime; for a degrade app, the shell factory — dispatches events against the shell, asserts on runtime data and the render tree, prints one `[pass]`/`[fail]` line per assertion, and exits non-zero on any failure. No browser, no mocks.

A review pass checks, in order:

1. Typecheck passes; every dev check passes; the manifest boots — moss refuses an incoherent charter, and a boot refusal is a finding, not an environment problem.
2. No JSX outside `ui/` and the entry point. No `fetch` outside the endpoint layer. No formatting (`Intl`, `toLocaleString`, date libs) outside Prism transforms.
3. Every action an opener loads with input declares it in the definition's `input`, and the declared fields are a subset of the action's `data` keys.
4. Every write's success path emits its change channel; every displayer of that entity listens.
5. No component name contains a domain noun; no component imports shell, action, or data code.
6. No layout or component branches on roles or capability data (rule 11) — per-principal difference is existence or a served variant.
6a. Every artifact the manifest carries is pure JSON and parses its schema — a function, a `Date`, an `undefined`, or a class instance in an artifact is a code file masquerading as data. The manifest's declared code fields (`functions`, the `inputs` hook) are the only exceptions and live outside the artifact tree.
7. Style guide bans (rule 16): `any`, `enum`, classes, default exports, `function` declarations by grep; type assertions and non-null `!` at the lint/typecheck level — grep can't tell negation from assertion. Declared shim exceptions are honored.
8. Decision points: each of D1–D5 is recorded in the app's `PLAN.md` with its tier — answered, delegated by name, or derived — never assumed silently.

Report violations by rule number. A change that makes the app less declarative, less validated, or less observable is wrong even if it works.
