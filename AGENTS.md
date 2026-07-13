# Building an application on nisc

For agents generating or reviewing a nisc application. The package READMEs and DESIGN docs document the libraries — read them before using one. This file states the application-level rules they don't cover, and it stands alone: it assumes the nisc packages and nothing else.

## The thesis

Everything the app does is data with a schema. An action is JSON. A layout is JSON. A transform is JSON. A query is JSON. A plan is JSON. Each artifact is validated by a Zod schema at the boundary and executed by a runtime; nothing executable is a code string. Imperative TypeScript exists only at the edges, and only as:

1. a **renderer primitive** — a registry component: props in, events out;
2. an **endpoint** — real data access behind a URL or registered function;
3. **setup** — shell construction, registry assembly, boot;
4. **authored data** — an `ActionDefinition`, a Prism config, a Zod schema: data written in TS for type-checking, serializable as-is;
5. a **check** — a `dev/` script driving the real shell to assert behavior.

Code that is none of these — a React feature component, a fetch-and-massage helper, an inline formatter — is a discipline break.

The mental model for the UI: **shells host canvases, canvases host stacks of actions, actions render JSON layouts.** There are no screens. Chrome, lists, forms, dialogs, dashboards — all of them are actions loaded onto canvases. How actions are arranged across canvases is a design choice.

## Decisions are the user's

This document has **rules** and **decision points**. Rules you follow without asking. Decision points are choices nisc deliberately leaves open — **never resolve one silently**. Present the options, the tradeoffs, and a recommendation, then wait for the answer. Decide alone only when you hold all the information an informed decision needs — for architecture questions you almost never do.

Collect the answers **before implementation starts**. The build is meant to run as an implement/check loop, and a loop that stops mid-flight to ask questions isn't running — front-loading the decisions is what lets it run to done. The known decision points:

- **D1 — Data layer.** What serves the endpoints: in-memory fixtures, a browser database (PGlite), a real backend, mixed. Nisc has no opinion.
- **D2 — Endpoint style.** URL endpoints vs registered functions (`fn`), per capability. URL-shaped data access keeps actions deployment-ignorant — an in-process handler swaps for a real server without touching an action; `fn` fits genuinely local capabilities.
- **D3 — Reads.** Vex query endpoints, or plain endpoints with hand-written handlers. *Whether* to use Vex is the decision; *how* is fixed (see "Using Vex").
- **D4 — Writes.** Plain endpoint handlers, or a declarative write DSL of the app's own. Vex has no write path — writes are always the app's code, however thin.
- **D5 — Routing.** Whether shell state syncs to the address bar.

Any other fork not covered by a rule gets one of two treatments. A genuine open choice is surfaced like a decision point. A choice that plainly follows from answers already given — the canvas arrangement implied by the views, one form per entity, delete-with-confirm — is **derived**: recorded in `PLAN.md` for review, not asked. When in doubt, ask.

Conflicts get the same treatment too: when this document, a package README, and the code disagree, one of them has rotted — report the discrepancy, don't guess which one is right.

## Before any code: the interview

Step one of every build is a conversation, not a scaffold. Ask the user one batched round of questions and record every answer in `PLAN.md` before writing anything else:

- **The decision points D1–D5**, each with options, a recommendation, and the consequences spelled out. Consequences are the point: "a browser database" is not an answer a user can evaluate — "your data lives in one browser profile: no sync, no other devices, gone if site data is cleared" is.
- **The dial-in:** which entities and relationships; expected scale; who uses it (single user? multi-user? auth — now or ever?); AI features (now, later, never — this shapes D3); look and feel; deployment target; what happens to the data long-term.

Rules of the interview:

- **Front-load everything.** Sweep the brief against D1–D5, the rules, and the order of work, and ask it all in one round. The goal is zero questions after the build starts; a fork that surfaces mid-build still gets asked, but treat it as a defect of your interview, not as routine.
- **Every choice lands in `PLAN.md` with its tier**: **answered** by the user, **delegated** by name ("D4: delegated"), or **derived** — it plainly follows from answers already given and is recorded for review, not asked. A blanket "go" or "you decide" delegates nothing. A choice that fits none of the three tiers blocks the build.
- If an answer implies a constraint the user didn't name (multi-user later → scope rules now; AI later → keep reads Vex-shaped now), say so during the interview, not in a commit message.

## The toolbox

Pick per need; every piece works standalone. Nova is the only mandatory one for an app with a UI.

| Package | Use it for | Don't use it for |
|---|---|---|
| `nova` | the UI: shells, canvases, actions, layouts, fragments | — |
| `prism` | every transform: shaping, formatting, branching | anything a schema or layout expresses directly |
| `vex` | query endpoints: `{ fingerprint, context }` → rows (see "Using Vex") | writes — it has none |
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
6. Nova doesn't know Prism: the shell's injected `transform` is the socket that makes Prism endpoint configs work. Wire it once in setup, and fold ambient app context (the signed-in user, the app's "today") into the source there — not into per-action data.
7. An endpoint is a contract, not an implementation (D1, D2). In-browser, server, or mixed — actions can't tell the difference, and must not be able to.
8. Writes are endpoints fired by triggers, never inline mutations (D4). Identity and tenancy are stamped by the endpoint, never client-supplied: a form never carries `owner_id`.
9. Formatting and derivation live in Prism transforms, never in components and never in action code.

**Schemas**

10. Everything that crosses a boundary is parsed by a Zod schema at that boundary. `.strict()` on external input.
11. An action's openable inputs live in its definition's optional `input` field: a JSON Schema — authored in Zod with `.describe()` on every field, converted with `z.toJSONSchema` — of the `data` keys an opener may seed when loading the action. The fields are a subset of `data`; no seedable keys, no `input`. That schema is the action's public contract, for a nav item, a URL, a command palette, and an agent alike. Catalogs curate ids and descriptions; they read `input` off the definition, never restate it.
12. For any LLM contract, the Zod schema is the single source of truth: constraints in `.describe()`, JSON Schema injected into the prompt at runtime, always minified. No prose "how the DSL works" sections in prompts.

**Code**

13. `/STYLE_GUIDE.md` applies in full. Zero-tolerance: `any`, type assertions (`as` — `as const` excepted), non-null `!`, `enum`, classes, default exports, `function` declarations. Deps via `pnpm add` only. Files: `kebab-case.role.ts`. Declared exception: a file that must match an external module's shape (a shim) may break these rules — it says why in a header comment, and reviewers honor it.

## Using Vex

Whether to use Vex is D3. How to use it is not a choice:

- **Boot one engine** — database adapter + cache backend + `ScopePolicy` — `introspect()` once at startup, memoized behind a single accessor.
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

- **Prewarm at boot** through the cache backend's own `set()`: key = the entry's `fingerprint`, `prismIr` = `await compile(mapping ?? { $ref: '$.result' })` (`@niscorp/prism`), plus the shape, the schema fingerprint, and `protected: true` — a seeded entry can never be replaced by a stray request. Seed the identity IR for mapping-less entries explicitly — a NULL IR falls through to the LLM mapper. Throw on duplicate names while seeding.
- **The fingerprint is the cache key.** Every entry replays as `{ fingerprint, context }` — no shape, no intent on the wire. Id fields still follow `<entity>_id` (self-describing rows); never a shared `{ value, label }`.
- **The mapping owns the result shape.** Vex evaluates it over `{ result: rows }` and returns the output verbatim — array, object, or scalar; the entry's stored shape picks array-vs-single. Formatting (money, dates) lives here, in shared helpers.
- **App reads are replay-only** — `{ locked: true }` on the engine call or endpoint config. An unknown fingerprint (a missed prewarm, a discipline break) is a 500, never a silent LLM call. With no AI features, also wire no hooks: warm-only, enforced twice.
- **Live queries are the opt-in LLM path.** Wire `createQueryDsl` / `createShapeMapper` (`@niscorp/vex/agent`) as the engine's `generateDsl` / `mapToShape` hooks; a request without a fingerprint generates, caches, and mints one (`meta.cache.fingerprint`) — embed that to replay the proven query. App reads stay locked and never depend on this path; agents and ad-hoc features do.
- **Staleness is handled through the slot.** When an entry must change, send its fingerprint with the changed request — the slot regenerates and replaces (protected entries 409 until unprotected). Don't edit cache rows by hand.
- **Scope is engine-side.** Access policy lives in the engine's `ScopePolicy`, invisible to and unforgeable by query authors — human or LLM.

## Working patterns

Stack-independent conventions:

- **Action data = endpoint-fed slots + UI state**, every key with a default. Loading is explicit data (`loading: true`), not Suspense.
- **Mount loads; `onSuccess` chains dependent loads.** Each independent section of a detail action is its own endpoint into its own slot.
- **Writers announce, viewers react.** A successful write emits a channel (`<entity>s-changed`); every action displaying that entity listens and re-reads. No shared stores. Message triggers carry no payload — when a listener must know *which*, use one channel per case (`nav-home`, `nav-tasks`), not a payload.
- **One form action per entity, create and edit.** Loaded bare it creates; loaded with the record's raw fields seeded it edits. Keep raw values (numbers, ISO dates, ids) alongside `*_display` strings so forms round-trip.
- **Interaction = `ref` + trigger.** Layout nodes carry `ref`; triggers catch `{ event, ref }` and run steps. Event payloads flow via `@event.payload`; no callbacks in props.
- **Fixtures pin "today".** Seed data around a fixed reference date, inject it as ambient context (rule 6), and compare against it — never the wall clock — or every date-relative view rots the day after generation.
- **The shell is a factory, not a singleton.** Build it as `createAppShell(deps)` with everything environmental — `fetch`, ambient context — injected, so dev checks construct the real app with real deps and nothing leaks between runs.

## Layout of an app

One workable arrangement. The directory names may vary with the app; the separation of roles may not.

```
src/
  nova/
    shell/         createShell wiring: canvases, actions, fragments, registry, routes
    chrome/        frame actions (nav, topbar)
    domains/<x>/   entity actions — list/detail/form, each an action+layout+prism trio
    surfaces/<x>/  non-entity actions (home, settings)
    fragments/     composable chrome
    shared/        cross-cutting actions and prisms
  ui/              the component kit + registry — the only React in the app
  <data>/          endpoint contracts and whatever serves them (api/, vex/, server/ — per D1)
  dev/             headless checks
```

## Order of work

1. **The interview** (see "Before any code") — every decision answered or delegated by name, recorded in `PLAN.md` with scope and data model.
2. **Scaffold** — boot + shell + canvases + empty registry; one placeholder action renders.
3. **Kit** — primitives against a kitchen-sink action; lock the look before any real feature.
4. **Data layer** — per D1/D3: contracts, fixtures/seed, endpoint handlers; prove one read end-to-end.
5. **Actions** — domain by domain: list → detail → form; chrome and routes as they're needed.
6. **Writes** — per D4, with change channels; prove one round-trip: create → announce → re-read.
7. **Checks and polish** — a dev check per feature; empty states, skeletons, transitions last.

## Verification

Every feature ships a headless check: a standalone script under `dev/` that boots the real app, dispatches events against the shell, asserts on runtime data and the render tree, prints one `[pass]`/`[fail]` line per assertion, and exits non-zero on any failure. No browser, no mocks.

A review pass checks, in order:

1. Typecheck passes; every dev check passes.
2. No JSX outside `ui/` and the entry point. No `fetch` outside the endpoint layer. No formatting (`Intl`, `toLocaleString`, date libs) outside Prism transforms.
3. Every action an opener loads with input declares it in the definition's `input`, and the declared fields are a subset of the action's `data` keys.
4. Every write's success path emits its change channel; every displayer of that entity listens.
5. No component name contains a domain noun; no component imports shell, action, or data code.
6. Style guide bans (rule 13): `any`, `enum`, classes, default exports, `function` declarations by grep; type assertions and non-null `!` at the lint/typecheck level — grep can't tell negation from assertion. Declared shim exceptions are honored.
7. Decision points: each of D1–D5 is recorded in the app's `PLAN.md` with its tier — answered, delegated by name, or derived — never assumed silently.

Report violations by rule number. A change that makes the app less declarative, less validated, or less observable is wrong even if it works.
