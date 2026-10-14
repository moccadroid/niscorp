# Building an application on nisc

> **Reading this from `node_modules/@niscorp/nisc/`?** It is the rulebook for the nisc version installed beside it, shipped with it. Where it names a path in the nisc repository, look here instead: `packages/<name>/README.md` and `DESIGN.md` are `node_modules/@niscorp/<name>/`; `/STYLE_GUIDE.md` is beside this file; the lab apps it holds up as examples (`apps/lab/lyceum`, …) and `docs/` are at [github.com/moccadroid/niscorp](https://github.com/moccadroid/niscorp). An app made by `npm create nisc` points its own `AGENTS.md` here.

> **Changing nisc itself — a package, not an app built on it?** The `@niscorp` packages are live on npm and may be in use by third parties. No change may break an app that works today, and a breaking change is never yours to decide: it is a last resort that needs the maintainer's explicit approval *before* it is written. Read `/STYLE_GUIDE.md`, "The packages are live", first, and then the last part of this file, "Changing a package": where a new thing goes, and the builds that fail when it goes somewhere else.

For agents generating or reviewing a nisc application. This file states the application-level rules, and it presumes no app that came before it — but it is not the whole specification. The **grammars** live in the package docs, and they are required reading, not background: a layout node, an `ActionDefinition`, a Prism config, a charter document and a Vex DSL are each defined in their own package's `README.md` and `DESIGN.md`. Read the doc for a package before authoring that package's artifact. This file governs how they compose into an application.

## The thesis

Everything the app does is data with a schema. An action is JSON. A layout is JSON. A transform is JSON. A query is JSON. A mutation is JSON. A charter is JSON. A plan is JSON. Each artifact is validated by a Zod schema at the boundary and executed by a runtime; nothing executable is a code string. Imperative TypeScript exists only at the edges, and only as:

1. a **renderer primitive** — a registry component: props in, events out;
2. an **endpoint** — real data access behind a URL or registered function;
3. **setup** — manifest assembly, registry assembly, boot;
4. **authored data** — an `ActionDefinition`, a Prism config, a Zod schema: data written in TS for type-checking, serializable as-is;
5. a **check** — a `dev/` script driving the real shell to assert behavior.

Code that is none of these — a React feature component, a fetch-and-massage helper, an inline formatter — is a discipline break.

The mental model for the UI: **shells host canvases, canvases host action instances, actions render JSON layouts.** There are no screens. Chrome, lists, forms, dialogs, dashboards — all of them are actions loaded onto canvases. How actions are arranged across canvases is a design choice.

A canvas holds its instances in one of two modes. `stack` (the default) is a card deck: the top instance is active, the rest suspended, and the canvas renders the top alone — menu → list → detail → form, with Back real. `list` is a tray: every instance stays live and the canvas renders them all through an `actionLayout` that loops `$.instances` into `ActionSlot`s. A list canvas is how a surface gets *composed* rather than drawn — nobody hand-authors a launcher; the actions render themselves.

By default the shell runs on the server: the app is a `defineApp` manifest handed to moss, which builds one durable shell per principal and streams rendered trees to a thin canvas terminal. That shell is **the app** — one per person, the thing that rearranges itself around them. A path can also lead to a **page** (`pages` on the manifest): the same actions on a manifest of its own, drawn for whoever asks and kept by nothing — a welcome, the docs. And the first screen of either can arrive *with* the page request, drawn on the server by the app's own kit and adopted by the terminal (moss DESIGN.md, "The document" and "Pages"). Client execution — the shell in the browser, built by the app's own factory — is an explicit degrade for offline and zero-backend apps (D1), not a mode menu.

## Decisions are the user's

This document has **rules** and **decision points**. Rules you follow without asking. Decision points are choices nisc deliberately leaves open — **never resolve one silently**. Present the options, the tradeoffs, and a recommendation, then wait for the answer. Decide alone only when you hold all the information an informed decision needs — for architecture questions you almost never do.

Collect the answers **before implementation starts**. The build is meant to run as an implement/check loop, and a loop that stops mid-flight to ask questions isn't running — front-loading the decisions is what lets it run to done. The known decision points:

- **D1 — Posture.** A moss server app (default: the shell runs server-side, the client is a canvas terminal) or a client-degrade app (the shell runs in the browser — offline, zero-backend, portable). The degrade is explicit, per app or per canvas.
- **D2 — Environment.** What the runtime is handed: the database (PGlite for dev and demos, Postgres for real), a cache backend, a session verifier. For a client-degrade app: what serves the endpoints — in-memory fixtures, PGlite, a real backend, mixed.
- **D3 — Reads.** Vex query endpoints, or plain endpoints with hand-written handlers. *Whether* to use Vex is the decision; *how* is fixed (see "Using Vex").
- **D4 — Writes.** Vex mutation entries — the closed grammar, authored like reads and replayed as `{ fingerprint, context }` — or plain endpoint handlers. Either way a write is an endpoint; nothing writes inline.
- **D5 — Routing.** What a path leads to. Three separate questions: whether the first screen is **drawn on the server** (it is drawn for whoever the browser's session cookie says, rule 12 — and a page drawn for a signed-in person may be kept by nothing between the server and their browser); which paths are **pages** rather than the app, and whether those are served live or written out as files (a file is only ever the page as nobody sees it; the build reports which pages can still do something and so want a server beside them); and whether the app's own shell state syncs to the address bar. Consequences to say out loud: a page keeps no shell, so anything on it that can be pressed gets a shell per connection, not per person; and the app's shell is one per person across every tab they have open, so a URL cannot hold a position inside it that two tabs disagree about.

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
| `nova` | the UI: shells, canvases, actions, layouts, fragments. Renderers are adapters (`/adapters/react`, `/dom`, `/tty`, `/ink`) — the core is surface-blind. `/reflect` inspects a live tree (checks, screen diffs), `/agent` is the layout-authoring surface, `/devtools` the inspector | — |
| `moss` | the app server: `defineApp` manifest + runtime → data layer, per-principal policy and catalogs, server shells, pages, the socket, and the canvas terminal (`/terminal` plus a per-surface entry: `/terminal/react`, `/vue`, `/dom`, `/tty`, `/ink`). Draws a page request's first screen (`renderDocument`, with `/terminal/react/server` and its siblings) and writes pages as files (`exportDocuments`). What is not its core is a feature, created by the app and named in the manifest's `features`: `/integrations` (separate services that add screens) and `/tide` (`createTideFacts`: each committed write, minted into tide as a fact) | client-degrade apps — they wire their own shell. Routing inside the app: there is none, shell state is the truth |
| `tide` | automations, as data: a reflex turns the clock, a write or a signal into one named effect, through a durable ledger. `createTideDriver` paces it (wake on a fact, sleep until the next due instant). `/postgres` is its store over Postgres (`createTideStore(pool)`; `TIDE_SEQUENCE` is its tables, for `runtime.tables`). Under moss a write reaches it through moss's `/tide` feature, and its ledger is read through vex like any table | a step language — a flow of several steps is a chain of reflexes, each effect producing the fact the next one fires on |
| `charter` | the policy document: roles → glob selections over the app's universes, resolved per principal, verified at boot | enforcement — the governed target enforces |
| `prism` | every transform: shaping, formatting, branching | anything a schema or layout expresses directly |
| `vex` | query and mutation endpoints: `{ fingerprint, context }` → rows or effects (see "Using Vex") | writes outside its closed mutation grammar |
| `loom` | compiling a Zod schema into an editing form — prefer it over hand-laying a form the schema already describes | layouts that aren't schema-backed documents |
| `signal` | LLM calls | — |
| `cortex` | agents, tools, orchestration | — |
| `solid` | streaming structured LLM output into UI | — |
| `cli` | the `nisc` command: `dev`, `build` (bundle, then say how each path is served — a file, or a server, and why), `export` (the site as a folder; only ever the page as nobody sees it), `start` (the built terminal, pages drawn), `check`, `migrate` (the tables' pending migrations, applied only if the app's entries fit the result). One file, `nisc.config.ts`, says how the app boots and how a screen is drawn | configuration of anything derivable — which paths exist and what each needs is read off the app |
| `strata` | versions: an app's tables as ledgered sequences; stored and submitted documents stamped and upgraded through grammar sequences; `strata upgrade` for artifacts in source (see Versions) | editing a migration that has run — append one |

## Rules

**Actions**

1. Everything visible is an action (`.action.ts`) + JSON layout (`.layout.ts`) loaded onto a canvas. No React views, no app logic in components.
2. One component registry, assembled once. Primitives are domain-blind: a component name containing a domain noun (`InvoiceRow`, `DealCard`) is a feature component in disguise — wrong. Repeated structure is a data-driven spec prop on a generic primitive (a `Table`'s `columns`), not a new component. A component never imports the shell, actions, or data code; if it needs domain knowledge to render, compute the field upstream in a transform. **Components are configured, never styled:** a prop says what a thing is (an area, an ink, a level) from a closed set of names; no `style`, `className`, colour or size is accepted from a layout, and an unknown value falls back to the default. The look lives only in the kit's CSS and tokens — a different look is a different stylesheet over the same layouts.
2a. A kit whose pages are drawn on the server draws the same thing on its first pass in the browser. Nothing that differs between the two — the window's width, a media query, storage, a portal target — may decide a component's first render: read it through `useSyncExternalStore` with a server answer, or in an effect. A `typeof window` guard around a state initialiser is not a fix, it is the bug: it makes the two sides disagree about the same render, and the terminal throws the page's elements away. What a component writes onto `<html>` from an effect (a palette, a scheme) is not in a drawn page until its script runs; the app reads it off the snapshot and hands it to the document (`renderDocument`'s `htmlAttributes`).
3. Reusable chrome (dialog frame, panel, drawer) is a fragment composed when an action is loaded (`with: [...]`), not a wrapper component. Modality is arrangement — an action loaded onto an overlay canvas with fragment chrome — never a `$.modalOpen` flag inside an action.
4. Shell state is the truth. Routing (D5), if wired, is a data table mapping paths ↔ actions, synced by an adapter; Nova stays URL-agnostic. A **page** is not routing inside the app: it is a separate manifest at a path (`pages`), drawn and let go, and a path's parameters seed the canvas the page names — nothing else about a URL reaches an action.

4a. A page's `<head>` is a node in a layout. `nova:head` holds the elements a head holds — `nova:title`, `nova:meta`, `nova:link`, `nova:script` — and a child's props are that element's attributes, written as given and bound to the action's data like any other node's. Nothing in it is drawn on the screen; whoever draws the page writes it into the document's `<head>` (`nisc build`/`export`/`start`, moss's `renderDocument`), and in the page the head follows the screen. No hook builds a head and no script rewrites a drawn file. What runs or styles — a script a browser would execute, a stylesheet, `http-equiv` — is never in a layout: it goes in `index.html`, the app's own file, or in the kit component that needs it. A page's canonical address comes from `site` in `nisc.config.ts` and the path. Whether a head sits in the action's own layout or in chrome around it (a fragment, the frame) is arrangement, like everything else.

**Data**

5. All data in and out of an action flows through its declared `endpoints`. Shaping is declared on the endpoint: a static request body is plain JSON; a body derived from the action's data is a Prism config, kept in a sibling `.prism.ts`. Prefer plain JSON when no mapping is required. Components never shape data.
6. Nova doesn't know Prism: the shell's injected `transform` is the socket that makes Prism endpoint configs work. Wire it once in setup, and fold ambient app context (the app's "today", the session's principal) into the source there — per session on the server under moss, in the shell factory in a client-degrade app — never into per-action data. The socket takes Prism's `evaluate` as it is (`transform: evaluate`), or a wrapper that adds to the source: `(config, source) => evaluate(config, { ...source, today })`. Hand `evaluate` the config object itself, never a copy of it and never one parsed again: it checks a config the first time it sees the object and only evaluates it after that. A test or a tool that must check everything on every call passes `{ check: 'always' }`. A config that is stored is compiled once and its IR executed (`compile`, `execute`).
7. An endpoint is a contract, not an implementation (D1, D2). In-browser, server, or mixed — actions can't tell the difference, and must not be able to. Server functions are endpoints too: the manifest's `functions(session)` seam runs them in-process under the caller's policy. The seam returns a list of `{ id, description, execute }`: the id is what the charter and an `fn:` endpoint name, and the description says what the function does and what to send, for the model that writes a call to it; a map of handlers is deprecated. A client-side `fn` registry is the escape hatch for client-degrade apps, and discouraged elsewhere.
7a. The manifest's three code seams are distinct, and app code goes in the one that describes it. `functions(session)` is for **endpoints** — things an action calls. `onSession(session)` is for per-shell code that is **not** an endpoint: an observer, a roster, an agent watching the screen. `runs` is the **sink** for model runs, fed by `session.recordRun`. Registering a handler nothing calls, to get code to run per session, is a lie about what that code is — use `onSession`. Both it and `functions` run before the shell finishes building, so neither may touch `session.shell` synchronously. The members of that shell that change what it is made of (`registerAction`, `setLayout`, `addCanvas` and their kin) throw there; the whole shell is `unverifiedShell(session)` from `@niscorp/moss/unverified`.
7b. A layout generated while the app runs is saved through `session.artifacts`, not set on the shell. `session.artifacts.save([{ kind: 'layout', body: { ref: 'action/<the action’s id>', layout, use: true } }])` keeps it for the session's principal: it is theirs alone, it is drawn on their screens at once with their data kept, and every save is a version (`list`, `history`, `restore`, `reset`). Without `use: true` it is kept and not drawn. The layout of the app's own shell is saved the same way under `ref: 'frame'`, and a canvas's under `ref: 'canvas/<the canvas’s id>'`: a page keeps the layouts it declares, a shell manifest with no `layout` (or a canvas with no `actionLayout`) has none to take the place of, and a frame that leaves a canvas out is saved as it is, so check that yourself where it matters. A canvas their shell does not declare, that a layout in force for a person has a canvas slot for, is taken out of their shell, with what is mounted on it, once no layout has the slot: declare a canvas that is to stay. No call can name anybody else: moss reads and writes those rows as the caller, and vex keeps them to the caller's own. **Who may save is the charter's**: put the call in a function, and grant the action that calls it to the roles that may. A body moss refuses (a ref no action of theirs keeps a layout under, a component no shell has, a binding to data the action lacks, a control the action listens on left out) rejects with a sentence: hand it back to whoever wrote the layout. A layout for everybody is published from the app's own server code and never from a session: `server.defaults(publisher).save([...])`, with the same body and the same five calls. It is drawn for everybody who holds the action, under a person's own layout in use and their roles' layout variant, and over the build's. `publisher` is who published, kept with the save: hand it the session's principal. **Who may publish is the charter's** too: put the call in a function and grant the action that calls it to the owners' role. No `userId` is `*`: that is whose the published rows are. An action or a fragment generated while the app runs is saved the same way: `{ kind: 'action', body }` or `{ kind: 'fragment', body }`, the body without an `id`, because moss gives it (`generated.` and a uuid, which `save` answers). It is its owner's alone, and what it defines replays reads and calls the functions its owner's roles grant: each endpoint is a `POST` to the app's vex route naming one fingerprint of a read the app ships and its owner may replay, or of a read vex wrote that its owner saved, or an `fn:` endpoint to a function its owner's roles grant (`session.functions()` lists them with their descriptions: hand that list to the model that writes the action). A read vex wrote for `session.answerIntent` is kept the same way: `session.artifacts.save([{ kind: 'read', id: '<the fingerprint vex answered>' }])`, with no body. It is answered to that person alone, it survives a schema change that does not touch what it reads, and their generated actions may replay it. A function its owner's roles do not grant, a write and any other address are refused with a sentence, and so is a generated action that opens an action its owner does not hold. Once it is in the shell it is an action like any other: it emits and listens on channels, and a fragment's steps run inside the action it is wrapped around. What an assistant may generate is the app's to decide, in its prompt and in the function that calls `save`. It is in its owner's shells a moment after `save` answers, not before. What is still being generated, and is to be seen at once, goes into the draft of the one shell it is worked on in: `session.draft.put([...])` takes what `save` takes and answers when that shell has it, so the function opens it on its next line; `session.draft.save()` then keeps all of it in one save, and `discard()` drops it. A draft is saved nowhere and is gone when its shell is. Never give an action or a fragment the app ships an id beginning with `generated.`. A layout is the one kind that is published.
8. Writes are endpoints fired by triggers, never inline mutations (D4). Identity and tenancy are stamped server-side from the session, never client-supplied: a form never carries `owner_id`. What a principal *is* beyond its id — a tenant, an org, a region — is the manifest's `scope(principal)` seam: moss always injects `{ userId }`, `scope` contributes the rest, and the merged set is what a behavior's `to:` resolves against at execute. The mapping is application knowledge, so the app supplies it; the values are injected server-side and unreferenceable by a request.
9. Formatting and derivation live in Prism transforms, never in components and never in action code.
9a. File pickers live in the kit. A file never goes over the socket; the app saves it wherever it wants.

**Principals**

10. The charter is the app's policy document: role names → glob selections over the app's universes — `actions` (which action ids exist for a principal), `data` (`table.verb` capabilities, compiled into the Vex `ScopePolicy`) and `functions` (which of the app's functions a principal's shell holds: a role with none may call none). Grant each role the functions its actions call, deliberately: moss refuses to boot and lists every call whose grants miss, for each role on its own, each combination people wear and `public`, and says where a role allows every function (`'*'`). The charter compiles; it never enforces and never shapes. Moss resolves it per principal and refuses to boot incoherent. Assignments (principal → roles) are app data beside it; row-level semantics the charter can't express are `behaviors`, compiled into the policy. One role name is fixed: a request with no session, and a signed-in principal with no assignment, resolve to `public`, so every charter defines it — `public: []` where it grants nothing. Boot does not check for it; without it those requests fail (`Unknown role "public"`).
10a. The `data` universe is the INTROSPECTED database, not your schema file: it holds the engine's own tables too — moss's `integrations` (integration key hashes), `integration_actions`, `moss_generation`, `sessions` (session token hashes, under moss's credential), the `strata_ledger`, the vex cache. A role granted a data wildcard (`*.read`) denies them explicitly (`data: { allow: ['*.read'], deny: [...] }`; denies do not inherit, so every role that grants the wildcard denies). A charter check resolves against the universe boot resolves against — the app's migrations and moss's run on a scratch database, then introspected — or it proves nothing about wildcards.
11. Per-principal UI is existence or a served variant, never a conditional. An action a principal lacks does not exist in their shell (ring 1); a different shape of the same action is a served variant (ring 2). Layouts and components never branch on roles or capability data. Ring 1 does the deriving: a canvas's `initial` takes a **candidate list** and the first id the principal actually holds mounts — members boot their home, anonymous boots the login, and nobody configures which. An ungranted candidate simply isn't there.
11a. Per-principal boot has two hooks, and they are twins. `inputs` derives boot **data** — merged over each canvas's static seed, read from action data downstream. `seeds` derives boot **instances** — which actions to push onto which canvases, computed from the session and its own reads over the session's wire, ring-1-filtered like every other mount. A composed surface (a home, an agent's column) is `seeds` plus a `list` canvas; hand-authoring the same arrangement names it twice. Branching chrome on `inputs` is a stopgap where a served variant doesn't exist yet.
11b. A page is drawn for whoever asks, and what it has for them is ring 1 like everything else: a strip naming the signed-in person is an action a member is granted, on a canvas whose candidates a stranger is granted none of. A page never knows less about a signed-in person than the app does, and never keeps a shell for them. **Who may keep a drawn page follows from who asked, and from nothing else** — drawn for nobody it is the same for everybody and may be cached or written to a file; drawn for somebody it is theirs. No page, route or app declares which; a static build only ever asks for the page as nobody.
12. Auth is a session token, nothing else — magic link is the default strategy; there are no username/password pairs in a nisc app if it can be avoided. Login is the anonymous principal's application. Session lifecycle is a **capability, not a channel**: login and sign-out are ordinary `fn:` endpoints calling `session.grant(token)` and `session.revoke()`, and the terminal reconnects as the new principal. The server consumes sessions and never mints identity. A page served by its app does not hold its session: the **browser** does, in a cookie no script can read, which moss writes in its answer to the socket's upgrade and reads for two things only — the upgrade from the app's own page, and choosing whose screen to draw. No route answers to it. Nothing in an app stores a token: not `localStorage`, not a cookie script can read. A sign-in the app answers over HTTP (a redeemed link, a provider's callback) sets that cookie on its response with `sessionCookies(request, token)` and redirects; it never hands the token to the page. A terminal that is not a page of its app (a process, another origin) holds its own token and offers it.

**Schemas**

13. Everything that crosses a boundary is parsed by a Zod schema at that boundary. `.strict()` on external input.
14. An action's openable inputs live in its definition's optional `input` field: a JSON Schema — authored in Zod with `.describe()` on every field, converted with `z.toJSONSchema` — of the `data` keys an opener may seed when loading the action. The fields are a subset of `data`; no seedable keys, no `input`. That schema is the action's public contract, for a nav item, a URL, a command palette, and an agent alike. Catalogs curate ids and descriptions and are resolved per principal (moss serves the resolved catalog); they read `input` off the definition, never restate it.
15. For any LLM contract, the Zod schema is the single source of truth: constraints in `.describe()`, JSON Schema injected into the prompt at runtime, always minified. No prose "how the DSL works" sections in prompts.

**Code**

16. `/STYLE_GUIDE.md` applies in full, with two app-level overrides: it is written for the packages, so its "custom error classes for domain errors" does **not** apply here — an app declares no classes at all and throws plain `Error`; and "Package prompts serve every app" binds packages, not apps — an app's prompts may be about the app. What an app measures against a package's agent is fixed in that package only in general form (see that section). Zero-tolerance: `any`, type assertions (`as` — `as const` excepted), non-null `!`, `enum`, classes, default exports, `function` declarations. Deps via `pnpm add` only. Files: `kebab-case.role.ts`. Declared exception: a file that must match an external module's shape (a shim) may break these rules — it says why in a header comment, and reviewers honor it.

**Versions** (`@niscorp/strata`; the why is `packages/strata/DESIGN.md`)

17. No package — and no app, where it can help it — runs DDL outside a strata sequence. Tables change by APPENDING a migration to their owner's sequence; a migration that has run is history, checksummed in the ledger, and editing it makes every database that ran it refuse to boot. The first migration of a sequence may be the old `IF NOT EXISTS` DDL verbatim — split with `sqlSteps(ddl)`, never on every `;` — and that is how an existing database adopts. An app's own tables are its `<app>.app` sequence, migrated by its runtime before the seed (lyceum is the example). An app deployed with `nisc migrate` hands that sequence to moss instead — `runtime.tables`, with `TIDE_SEQUENCE` (from `@niscorp/tide/postgres`) when it keeps tide's tables — and the function that opens its runtime migrates and seeds nothing: what it changes itself is changed before the step can check it. Rows an app needs in order to start are written by a migration step, in the same transaction as its tables; a seed that runs at start is for development and demos.
18. A grammar change is a migration. Changing a schema behind a document kind — nova's actions and layouts, Prism's config, an app kit's component props (`NiscApp.grammars`) — appends to that grammar's sequence: an empty marker for an addition (strict readers must still refuse the newer documents), document steps (a Prism config over ONE node; the grammar's embeddings find every node) for anything else. `pnpm check:grammars` refuses the change until it does, and checks every captured document still upgrades and parses. A grammar version is history — its migrations, and every corpus file captured at an earlier stamp. Its snapshot is its fingerprint: when the grammar did not change but what records it did (a validator describing the same schema differently, strata reading it differently), the current version is re-recorded with `pnpm strata:snapshot --rebaseline` (an app kit: its own snapshot script with `--rebaseline`) in a commit that changes nothing else, and only while the corpus passes — never edited by hand, never answered with a marker.
19. Stored and submitted documents carry the stamp they were written at and are upgraded where they are read. Ahead of the reader on any grammar the reader was given is refused (`TOO_NEW`), never guessed at: the reader upgrades first — host before add-on, server before terminal.
20. An app's source records its grammars in `strata.lock.json`. When a grammar moves: `pnpm strata upgrade` writes the exact expected JSON and a report; edit what it lists; `pnpm strata verify` holds the edit to that JSON and only then moves the lock. Never edit the lock by hand, and never "fix" an edit toward a green verify by any route but the expected JSON. `pnpm check:sources` fails an app whose source is behind.

## A worked trio

One feature — a list you can act on — as the three files it actually is. It replays the `todos/open` entry from "Using Vex" below; nothing else about it is special. Read the rules through this, not around it.

**`todos.action.ts`** — the definition. Every `data` key carries a default; endpoints declare their shaping; triggers catch refs.

```ts
import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { todosLayout } from './todos.layout';
import { todosPrism, setDonePrism } from './todos.prism';

export const todosAction: ActionDefinition = {
  id: 'todos.list',
  title: 'Todos',
  // endpoint-fed slots + UI state — every key present, every key defaulted
  data: { ownerId: '', rows: [], toggleTodoId: '', toggleDone: false, loading: true },
  layout: todosLayout,
  // a contract, not an implementation (rule 7): the same action runs
  // unchanged against moss or against a degrade app's own endpoints
  endpoints: {
    load: { url: '/api/todos/vex', method: 'POST', request: todosPrism, target: 'rows' },
    setDone: { url: '/api/todos/vex', method: 'POST', request: setDonePrism },
  },
  // mount loads; loading is explicit data, never Suspense
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'toggle',
      do: [
        { set: 'toggleTodoId', value: '@event.payload.todo_id' },
        { set: 'toggleDone', value: '@event.payload.next' },
        // writers announce…
        { call: 'setDone', onSuccess: [{ call: 'load' }, { emit: { channel: 'todos-changed' } }] },
      ],
    },
    // …viewers react — this action displays todos too, so it listens to its own
    { message: 'todos-changed', do: [{ call: 'load' }] },
  ],
};

// Rule 14: what an opener may seed, as a JSON Schema. Every field described;
// every field a key of `data` above.
export const todosInputSchema = z.toJSONSchema(
  z.object({
    ownerId: z.string().optional().describe('Seeded from the session by the chrome; never client-authored.'),
  }),
);
```

**`todos.layout.ts`** — JSON. Domain-blind primitives driven by spec props (rule 2); `ref` is what the trigger catches. Component names resolve against the app's registry in `ui/`. Nova ships a headless base set per adapter (`Stack`, `Box`, `Text`, `Input`, `Button`, `Panel`, `JsonTree`, plus the `CanvasSlot` / `ActionSlot` markers) via `registerNovaReactComponents` — but both exemplars take only the two slot markers and build the rest themselves, because the kit is where the app's look lives (order of work, step 3). Assume every other name here is one you define.

```ts
import type { LayoutNode } from '@niscorp/nova';

export const todosLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 20, maxWidth: 900 },
  children: [
    {
      component: 'Rows',                          // generic, not TodoRow
      props: {
        rows: '$.rows',
        loading: '$.loading',
        rowKey: 'todo_id',
        empty: 'Nothing open.',
        columns: [                                // repeated structure is DATA
          { label: 'Todo', w: 1, cell: { kind: 'primary', key: 'title', subKey: 'due_display' } },
          { label: 'Done', w: 'auto', cell: { kind: 'switch', key: 'done', ref: 'toggle', label: '' } },
        ],
      },
    },
  ],
};
```

**`todos.prism.ts`** — the endpoint bodies. A Vex replay is `{ fingerprint, context }`; `$ref` pulls from the action's own data (rule 5).

```ts
import { todosOpen, todoSetDone } from '../../vex/todo.entries';

export const todosPrism = {
  fingerprint: todosOpen.fingerprint,
  context: { ownerId: { $ref: '$.ownerId' } },
};

export const setDonePrism = {
  fingerprint: todoSetDone.fingerprint,
  context: { todoId: { $ref: '$.toggleTodoId' }, done: { $ref: '$.toggleDone' } },
};
```

Note what is absent: no React, no `fetch`, no date formatting, no `if (role === …)`, no `owner_id` on the wire from the client. `due_display` arrives already formatted — that happened in the entry's mapping, upstream (rule 9).

## Using Vex

Whether to use Vex is D3 (reads) and D4 (writes). How to use it is not a choice:

- **Reads the app depends on are deterministic.** Author each one as a seed entry — Vex's own cache row minus the machine-filled bits. `SeedEntry` and `SeedMutation` are exported for exactly this; don't hand-roll a `Pick<>` over the cache types:

```ts
import type { SeedEntry } from '@niscorp/vex';

export const todosOpen: SeedEntry = {
  fingerprint: 'todos/open',                            // THE cache key — the name every read replays
  intent: 'List open todos ordered by due date',        // one factual sentence — mandatory
  shape: [{ todo_id: '', title: '', due_display: '' }], // drives the array-vs-single envelope on replay
  dsl: {                                                // hand-authored; { $context: 'key' } for parameters
    from: ['todos'],
    fields: [{ field: 'todos.id', as: 'todo_id' }, 'todos.title', 'todos.due_date'],
    filter: { eq: ['todos.done', false] },
    sort: [{ field: 'todos.due_date', dir: 'asc' }],
    limit: 200,                                         // how many rows this list is for — state it on every list
  },
  mapping: { /* Prism over { result }: the rows (array shape) or the one row (object shape); omit when the DSL already aliases to the shape */ },
};
```

- **Every list states its `limit`.** A seeded entry reads at most the `limit` it states, and the engine does not lower that number unless the deployment tells it to. A list that states none gets the engine's default of 100 and no more — when exactly that many come back, the reply's `meta.warnings` and the server console say the list may have been cut. That line means the entry is missing a `limit`; write one.
- **Writes are mutation entries in the same store.** A `SeedMutation`: a statement in the closed mutation grammar in place of a query DSL, the same wire shape (`{ fingerprint, context }`). Mutations are replay-only forever — never generated; `lintMutation` runs at seed and throws on a failing statement, and context signatures are derived for discovery.
- **A parent and its children are one batch.** An array of statements runs in one transaction, and a later statement reads the row an earlier one wrote: `{ $returned: 'orders.id' }` is the id the database just generated for the `orders` insert earlier in the same batch, so a generated id reaches the rows that point at it without leaving the server, and the write is all or nothing. The statement it names must write exactly one row, or the whole batch is refused. The reply is every statement's rows in order — and exactly one row comes back as that row, not an array of one.
- **Under moss (the D1 default), hand the entries to `defineApp({ entries })`.** The server derives the data layer: boots the engine, holds the entries and compiles them, serves locked replay-only endpoints, and compiles each principal's `ScopePolicy` from the charter's `data` section. The app never touches an engine, and never writes an entry into vex's cache table itself: entries that arrive while the app runs are handed over with `server.replaceEntries(source, entries)`.
- **A client-degrade app boots its own engine** — database adapter + cache backend + `ScopePolicy` — `introspect()` once at startup, memoized behind a single accessor. Prewarm at boot through the cache backend's own `set()`: key = the entry's `fingerprint`, `prismIr` = `await compile(mapping ?? { $ref: '$.result' })` (`@niscorp/prism`), plus the shape, the schema fingerprint, and `protected: true` — a seeded entry can never be replaced by a stray request. Seed the identity IR for mapping-less entries explicitly — a NULL IR falls through to the LLM mapper. Throw on duplicate names while seeding.
- **The fingerprint is the cache key.** Every entry replays as `{ fingerprint, context }` — no shape, no intent on the wire. Id fields still follow `<entity>_id` (self-describing rows); never a shared `{ value, label }`.
- **The mapping owns the result shape.** Vex evaluates it over `{ result, context, scope }` and returns the output verbatim — array, object, or scalar. The entry's stored shape picks what `$.result` is: an **array** shape → `$.result` is the rows (map with `$map`, or `{ $ref: '$.result' }` for identity); an **object** shape → `$.result` is the single (first) row, `null` when none came back (read fields as `$.result.monthly`, never `[0, …]`). Formatting (money, dates) lives here, in shared helpers.
- **App reads are replay-only.** Moss serves its endpoints locked; a client-degrade app passes `{ locked: true }` itself. An unknown fingerprint (a missed prewarm, a discipline break) is a 500, never a silent LLM call. With no AI features, also wire no hooks: warm-only, enforced twice.
- **Live queries are the opt-in LLM path.** Wire `createQueryDsl` / `createShapeMapper` (`@niscorp/vex/agent`) as the engine's `generateDsl` / `mapToShape` hooks; a request without a fingerprint generates, caches, and mints one (`meta.cache.fingerprint`) — embed that to replay the proven query. App reads stay locked and never depend on this path; agents and ad-hoc features do.
- **Freshness is the entry's.** `refresh: 'snapshot'` (the default) answers once; `refresh: 'reactive'` answers again when a write lands on a table the query reads. Declare it on reads that are on screen while others write — a roster, a count, a board. A reactive entry sorts, and reads time from `$scope`, never context.
- **Staleness is handled through the slot.** When an entry must change, send its fingerprint with the changed request — the slot regenerates and replaces (protected entries 409 until unprotected). Don't edit cache rows by hand.
- **Scope is engine-side.** Access policy lives in the engine's `ScopePolicy` — compiled from the charter under moss — invisible to and unforgeable by query authors, human or LLM.

## Working patterns

Stack-independent conventions:

- **Action data = endpoint-fed slots + UI state**, every key with a default. Loading is explicit data (`loading: true`), not Suspense.
- **Mount loads; `onSuccess` chains dependent loads.** Each independent section of a detail action is its own endpoint into its own slot.
- **Reactive reads keep screens current; channels are for what is not data.** A vex read whose entry declares `refresh: 'reactive'` answers again, on every screen that has it open, whenever a write lands on a table it reads — nothing announces the change and nothing listens (vex DESIGN.md, "Reactive reads"). Under moss, that is how a screen follows its data. Where a read stays a snapshot, or a client-degrade app has no follower, the older pattern holds: writers announce, viewers react — a successful write emits a channel (`<entity>s-changed`) and every action displaying that entity listens and re-reads. Channels also carry signals that are not data (the deck moving on). No shared stores. A message can carry a payload (`{ emit: { channel, payload } }`, or moss's `shells.deliver(principal, channel, payload)` from the server); a listener reads it as `@event.payload`. A payload says what happened, never data a screen should read: data still reaches a screen through its reads.
- **One form action per entity, create and edit.** Loaded bare it creates; loaded with the record's raw fields seeded it edits. Keep raw values (numbers, ISO dates, ids) alongside `*_display` strings so forms round-trip.
- **Interaction = `ref` + trigger.** Layout nodes carry `ref`; triggers catch `{ event, ref }` and run steps. Event payloads flow via `@event.payload`; no callbacks in props.
- **A composed surface is rows, not a layout.** Where several things coexist — a home, a launcher strip, an agent's column — use a `list` canvas seeded by `seeds` from resolved rows, and let each action render itself. Which surfaces land where is the *row's* business (its canvas), not a second authored list. Whether an action can appear that way is read off its own contract — an action that declares a collapse key in its `input` can render small, so a surface that ships one joins the composition the moment its rows land, with no registry to update.
- **What should still be there is a row, not a screen.** A server shell is memory: a deploy, a restart or an idle spell replaces it with one built from the manifest and whatever the app reads from rows as it builds — `inputs`, `seeds`, an action's mount hook. So what a person should find again is a row, and an action that shows nothing keeps a canvas on it: its mount reads the row and `replace`s or `reconcile`s the canvas (lyceum's `stage.deck` keeps the stage on the slide its `deck` row names). A screen a person opened that no row describes — a sheet, a record pushed over a list — is gone after a rebuild, with whatever was typed into it. Shell state is the truth of what is on screen now (rule 4); it is not kept.
- **What a lost connection looks like is the kit's.** When the socket drops, the last screen stays up while the terminal reconnects, and looks exactly like a live one. Every render target is told the connection's status: a browser target says it on its root element (`data-wire-status`: `connecting`, `open`, `closed`, `incompatible`, `static`) and draws nothing, so the kit's stylesheet decides what `closed` looks like. No action, layout or component prop carries it: the connection is the terminal's, not the app's data.
- **Seeds choose their clock.** A seed pins a fixed reference date or shifts with the wall clock — per what the seed is for: a regression fixture pins, a demo that must look alive today shifts. Either way the app compares against injected context (`$.today`, per request under moss) — never a wall-clock read inside a transform, query, or layout.
- **The app is a manifest; only degrade shells are factories.** Under moss the app is `defineApp({...})` and the server builds one durable shell per principal — dev checks boot the same manifest with a dev runtime. A client-degrade app builds its shell as `createAppShell(deps)` with everything environmental injected, so checks construct the real app with real deps and nothing leaks between runs.

## Failure modes worth naming

Four mistakes that have each cost more than the thing they were avoiding. The
first three share one shape — **concluding the system cannot do something without
testing whether it can** — and each produced a workaround larger than the check
would have been. The fourth is what happens on the way back out.

### 1. Do not rationalise a limitation into a principle

While adding per-role reach (`scoping`), the resolver collapsed a principal's
roles into ONE profile and threw when two roles named different ones. That throw
was written up as *"incoherence, not a precedence puzzle — refused, in the same
spirit as two granted layout variants for one action."*

It is not the same. Two layout variants for one action genuinely conflict — a
screen renders one. Two roles naming different reaches is an instructor who also
trains: staff on the roster, a member in the class. The rule existed to make the
design self-consistent, and the domain broke it within the hour.

**The tell:** a rule justified by analogy to a different rule, rather than by a
case it would prevent. If you cannot name the bad thing it stops, it is a
limitation wearing a principle's clothes.

### 2. Test the mechanism before you blame it

A charter `deny` was used to stop a grant riding up the role ladder. It appeared
not to survive `extends`, so a table that should have been deleted was kept and
the "limitation" was written into permanent comments as its justification.

`deny` works exactly as documented — a child re-adds a denied grant, verified in
five lines. What had actually happened: a patch script targeted the wrong role
because line numbers shifted after an earlier edit. The fault was in the edit,
not the engine.

**The rule:** before documenting a limitation in someone else's package, write
the smallest program that demonstrates it. If that program is hard to write, the
limitation probably is not real.

### 3. Believe the schema over the resolver

The schema splits `staff` and `memberships` into two tables, with a comment
saying why: *a person can be staff at a studio and hold a membership there too.*
The directory above it then flattened every person to one word
(`audienceOf(staffRole) ?? 'member'`), and `assignments` gave each person one
role. The thing the data model deliberately kept apart, the policy layer
collapsed — and three workarounds grew on top of the collapse: an extra scoping
profile, a projection table, and a deny that was never needed.

**The rule:** when a resolver contradicts a comment in the schema, the schema is
usually right. It was written when somebody was thinking about the domain; the
resolver was written when somebody was thinking about the code.

### 4. Undoing a workaround moves the boundary — say where it went

Deleting the three workarounds was not free, and the free-looking version would
have been the dangerous one. `member_cards` existed so a member could see their
plan and price without holding `subscriptions.read`; deleting it means the member
rung holds that verb, at personal reach. Replaying the revenue fingerprint as a
member therefore returns a *number* rather than a refusal — their own bill, not
the studio's — where before it bounced at the verb.

That is a real weakening, and it is the right trade: the same verb at two reaches
is the whole design. But it was found by a check going red, not by the reasoning
that authored the change. Two existing checks asserted "refused" and had to be
rewritten to assert "not the studio's figure" — and rewriting a red assertion is
exactly where a leak gets waved through.

**The rule:** when a check fails because the design moved, do not adjust it to
match the new behaviour. Work out what the old assertion was protecting, then
write the assertion that protects the same thing under the new shape. Here that
meant comparing the member's figure against the owner's rather than testing for a
status code.

**And check the ones that stayed green.** A check that asserts a *mechanism* can
go on passing while the *consequence* it was standing in for has inverted.
`scoping-check` asserted "an instructor who also trains reads the whole studio" —
green, correct, and describing a screen that was showing him all 93 bookings at
the studio under the heading "what you have booked". Widening reach turned a
true statement about the engine into a false one about the product. After a
change to how far somebody reaches, re-read every assertion that mentions them,
not only the red ones.

### The habit that catches all four

Before building around a constraint, spend five minutes proving it exists. Every
workaround in this list was bigger than its proof would have been, and two of
them were built around constraints that were never there.

And when you take one out, name what it was holding up. A workaround that was
never needed still moved a boundary while it stood there.

## Layout of an app

One arrangement. `app/` holds **artifacts only**: every file there is pure, schema-valid JSON authored in TS (a check enforces it). Code lives outside `app/` — the environment in `db/`, helpers in `lib/`, the server glue and fns in `server/`, the component kit in `ui/`.

Three naming rules make the tree legible, and they're the same rules the artifact library will type its rows by:

- **A folder names the governor** (or, for nova's many kinds, the domain): `charter/` and `vex/` group a library's artifacts; `actions/domains/<x>/` groups a domain's.
- **A suffix names the kind** — the specific artifact type, which is also its library row type: `.action.ts`, `.layout.ts`, `.fragment.ts`, `.prism.ts`, `.entries.ts`. Multi-member kinds (many files, one artifact each) carry it. A file holding several artifacts of one kind pluralizes — `issue.actions.ts`, `arrival.layouts.ts` — which is a legitimate grouping when the artifacts are one feature's set, not a dumping ground.
- **A single-document field is named by the field, no suffix**: `charter.ts`, `assignments.ts`, `behaviors.ts`, `resources.ts`, `app.ts`. There's only one — nothing to disambiguate. Index files that assemble a kind are named for it: `action-catalog.ts`, `layout-variants.ts`.

There is deliberately **no library suffix** (`.vex.ts`, `.charter.ts`): the suffix names the kind, not the governor — the governor is the folder. `.action.ts` is not `.nova.ts`.

```
src/
  app/                     ARTIFACTS ONLY — pure JSON, each parses its schema
    app.ts                 the defineApp manifest — one import per field
    pages.ts               pages: what is drawn at a path and kept by nothing (single doc) —
                           only if the app has any
    action-catalog.ts      ring 1: the action index (actions)
    layout-variants.ts     ring 2: the minted layout-variant index (layouts) — only if
                           the app mints variants; ring-1 existence covers most difference
    charter/               charter.ts, assignments.ts
    actions/               the trios — chrome/, domains/<x>/, surfaces/, shared/ if earned
                           (a variant layout sits beside its base: topbar.layout.ts + topbar.full.layout.ts)
    shell/                 the shell manifest's chrome — frame.layout, stack layouts, fragments/
    prisms/                shared authored transforms (money, dates)
    vex/                   the vex data surface (governor folder, mirrors charter/)
      <entity>.entries.ts    read + mutation entries, one file per entity
      behaviors.ts           row-level scope semantics (single doc)
      resources.ts           entity subgraphs → /api/<name>/vex (single doc)
    grammars/              only if the app owns a grammar: its strata sequences
                           (`<app>.kit` — its components' props), manifest field `grammars`
  db/                      the environment (D2): schema DDL, seed — NOT artifacts, not in the library
  lib/                     code helpers (date, etc.) — only what has nowhere better to live
  server/                  moss glue (boot + listener), server fns, and the manifest's
                           non-endpoint session code (onSession observers, the run sink).
                           When pages are drawn on the server: document.ts (how a screen is
                           drawn — the kit handed to moss, and what the kit would put on
                           <html>). No production route: `nisc start` serves the built terminal.
                           No dev glue either: `nisc dev` runs the app server inside vite
                           (moss's dev plugin, fed from nisc.config.ts) — vite.config.ts
                           holds the framework plugin and nothing else
  ui/                      the component kit + registry — the only renderer code in the app
  dev/                     headless checks; strata.ts lists the artifacts for `pnpm strata`
  main.tsx                 the terminal entry
nisc.config.ts             what the app tells the `nisc` command: how it boots, how a screen is
                           drawn — only if its pages are drawn on the server or built to files
strata.lock.json           which grammar version the source is written in (rule 20) — committed,
                           moved only by `pnpm strata verify`
```

Apps to read: lyceum (`apps/lab/lyceum`) for a moss server app; nisc-website and moccadroid-website for an app with its own shell. atrium, lyra and relay are older: read one for a surface it targets, not as a model.

Why the split: the manifest's data fields are on their way to becoming library rows (deploy = a write, not a rebuild), so keeping them pure and schema-valid now — with `db/` and `lib/` code held firmly outside `app/` — is what makes the tree row-ready. A client-degrade app replaces `server/` with whatever serves its endpoints (per D2) and boots its shell factory from the entry point.

`ui/` is the app's renderer kit, and which renderer is a choice: a React or DOM terminal in a browser, a tty or ink one in a console. The core is surface-blind, so the kit is the only place that isn't — an app targeting two surfaces ships two kits against one registry contract, and nothing above `ui/` changes.

An app may stand a **sibling service** beside the main one — a connector host, a back-office tool — as its own process with its own port, manifest and charter. It is a separate app under the same roof, not a section of this one: it does not share the main app's shell, and what crosses between them crosses over the wire through a gate the main app owns. Treat it as a second application built by these same rules.

## The client-degrade path (D1)

The degrade is for offline, zero-backend and portable apps — a demo that must run from a static host, a tool with no server to deploy. It is a posture, not a lesser mode: the artifacts are identical, and an action cannot tell which one it is running under.

What changes is only who assembles and serves:

- **The shell is a factory, not a manifest.** `createAppShell(deps)` builds it in the browser with everything environmental injected — the fetch seam, the app's `today`, the transform socket (rule 6). Nothing environmental is read from module scope, so a check constructs the real app with real deps and nothing leaks between runs.
- **`server/` is replaced by whatever serves the endpoints** (D2): in-memory fixtures, PGlite in the browser, a real backend, or a mix. Endpoints keep their URLs and shapes — that is what makes the posture invisible upstream. The client-side `fn` registry is the escape hatch here and only here (rule 7).
- **The app boots its own Vex engine** — database adapter, cache backend, `ScopePolicy` — `introspect()` once at startup behind a single memoized accessor, prewarming and locking replay itself. See "Using Vex" for the exact seeding contract; under moss the server does all of this, and here the app does.
- **`inputs`, `seeds`, `scope`, `onSession` and `runs` have no host.** Whatever they derived, the factory derives at construction. There is no durable per-principal shell and no server-side resolution.
- **The first screen still arrives as markup.** A degrade app is not a blank page until its script runs: `nisc export` runs the app's own boot at build, draws the settled screen to markup, and writes one file per path; the browser entry boots the same shell and adopts it (`@niscorp/cli` README, "An app with its own shell"). The `nisc.config.ts` hands over `shell` (the boot — unmemoized, handed a path and nothing else), `draw` and `adopt`; the build fails unless every path is drawn, whole, the same on a second boot, and adopted clean. That makes the boot's determinism a rule here, not a nicety: no random id or wall-clock read may reach the markup, and a read that answers differently in the page than it did at build is drawn again there — the build names every such read ("opened with …").

Say this out loud in the interview, because it is the part a user cannot infer: **in a degrade app the charter is not enforcement.** Ring 1 still decides what exists in the shell, and that is honest UI, but the data is in the browser and the policy is in the browser with it. Nothing here is a security boundary. An app that needs one needs a server (D1) — offer that rather than a scope rule that looks like a lock.

`fable` and `mythos` predate the `app/`-is-artifacts-only tree above and are arranged differently (`nova/`, `api/`, `vex/`, `boot.ts`) — read them for the boot and engine wiring, not for the layout.

## Order of work

1. **The interview** (see "Before any code") — every decision answered or delegated by name, recorded in `PLAN.md` with scope, data model, and roles.
2. **Scaffold** — manifest + runtime + terminal (moss), or boot + shell factory (degrade); canvases + empty registry; one placeholder action renders. `npm create nisc` makes exactly this — from templates that are themselves checked apps — and writes `PLAN.md` with D1 and the renderer answered and the rest open; the interview (step 1) is then about what it left open.
3. **Kit** — primitives against a kitchen-sink action; lock the look before any real feature.
4. **Data layer** — per D2/D3: schema, seed, entries, behaviors; prove one read end-to-end.
5. **Actions** — domain by domain: list → detail → form; chrome and routes as they're needed; new action ids granted in the charter as they're minted.
6. **Writes** — per D4, with change channels; prove one round-trip: create → announce → re-read.
7. **Checks and polish** — a dev check per feature; empty states, skeletons, transitions last.

## Verification

Every feature ships a headless check: a standalone script under `dev/` that boots the real app — for a moss app, the manifest through `createServer` with a dev runtime; for a degrade app, the shell factory — dispatches events against the shell, asserts on runtime data and the render tree (`@niscorp/nova/reflect` reads a live tree), prints one `[pass]`/`[fail]` line per assertion, and exits non-zero on any failure. No browser, no mocks.

A `dev/all-checks.ts` runs the suite and is the app's `check` script. It spawns **each check as its own process over its own fresh database** — checks ship the app different histories, and a shared database would make the order of the suite part of its meaning.

A review pass checks, in order:

1. Typecheck passes; every dev check passes; the manifest boots — moss refuses an incoherent charter, and a boot refusal is a finding, not an environment problem.
2. No renderer code (JSX, a tty kit) outside `ui/` and the entry point. `server/document.ts` hands the kit's registry to moss to draw a page with; it imports the kit and contains no renderer code of its own. No `fetch` outside the endpoint layer, except to send a file (rule 9a). No formatting (`Intl`, `toLocaleString`, date libs) outside Prism transforms.
3. Every action an opener loads with input declares it in the definition's `input`, and the declared fields are a subset of the action's `data` keys.
4. Every displayer of an entity stays current after a write: its read is `refresh: 'reactive'`, or the write's success path emits a change channel the displayer listens to.
5. No component name contains a domain noun; no component imports shell, action, or data code.
6. No layout or component branches on roles or capability data (rule 11) — per-principal difference is existence or a served variant.
6a. Every artifact the manifest carries is pure JSON and parses its schema — a function, a `Date`, an `undefined`, or a class instance in an artifact is a code file masquerading as data. The manifest's declared code fields (`scope`, `identity`, `phrases`, `functions`, `onSession`, `runs`, a reaction's `run`, `features`, and the shell's `inputs` and `seeds` hooks) are the only exceptions; they live outside the artifact tree and are validated by running, not by this check. Moss reads the manifest by a schema when it is handed to `createServer` and refuses to boot on one that does not parse, a code field that is not a function included; this check finds it before a boot does.
6b. Session code sits in the seam that describes it (rule 7a): no handler registered on `functions` that nothing calls. Tenancy resolves through `scope` and engine-side behaviors, never from a request field.
6c. No role holding a data wildcard reaches the engine's tables, and the charter check resolves against the universe boot does (rule 10a).
6d. Where pages are drawn on the server: a check opens the drawn page with the real wire and target and the terminal adopts it with nothing said (rule 2a), at every window width the kit distinguishes; a page drawn for somebody goes out `private, no-store`; and every sign-in the app answers over HTTP sets the session cookie on its response and hands the page nothing (rule 12).
7. Style guide bans (rule 16): `any`, `enum`, classes, default exports, `function` declarations by grep; type assertions and non-null `!` at the lint/typecheck level — grep can't tell negation from assertion. Declared shim exceptions are honored.
8. Decision points: each of D1–D5 is recorded in the app's `PLAN.md` with its tier — answered, delegated by name, or derived — never assumed silently.
9. Versions (rules 17–20): `pnpm check:grammars` and `pnpm check:sources` pass; no DDL outside a sequence; no edited migration, snapshot, early-stamp corpus file or hand-moved lock.

Report violations by rule number. A change that makes the app less declarative, less validated, or less observable is wrong even if it works.

## Changing a package

**This part is for whoever changes a `@niscorp` package. Everything above it is for whoever builds an app on them.** Read `/STYLE_GUIDE.md`, "The packages are live", before it: what a change may do to an app that works today comes first.

**A package is held to the rules nisc sets for apps.** It runs no SQL of its own: its reads and writes are vex entries, as an app's are ("Using Vex"). What crosses a boundary is parsed by a schema (rule 13), rule 16 applies in full, and its tables are strata sequences (rule 17). Moss broke each of them for as long as they were only written down: forty statements sent straight to the pool, one boundary with a schema, 135 exported names of which 71 were imported by nothing, one function of 1,345 lines (the audit is in the history of `docs/plans/moss-refactor.md`). The rules below are what was missing, and each has a build that fails.

**A package is made of modules.** A module is a directory under `src/` with an `index.ts`.

1. **One door.** Code outside a module imports `../<module>`, never a file inside it.
2. **Declared dependencies.** Which module may import which is one table, in `scripts/check-modules.mts`, and the table has no cycle. A new import between two modules is a line in that table, in the same change.
3. **One owner.** Each table and each piece of state that outlives a request belongs to one module. Nobody else writes it.
4. **Narrow inputs.** A factory takes a typed object of the functions and values it needs. Never the whole manifest, never the whole runtime, never an object that stands in for either.
5. **Parse where it enters.** A body, a socket message, a row, a fetched payload, a message from another process, a token: parsed by a schema in the module where it enters. No type assertion.
6. **Nothing flat.** Only `index.ts` sits at the top of `src/`.
7. **Limits.** A function of up to 200 lines is fine; 300 is the ceiling, for the rare one that reads better whole than cut up. A file is at most 400 lines of code, a line at most 200 wide. Do not split a function or a file to satisfy a number: split it when it has stopped being one thing. The other way round too: a file of a few lines joins the file that uses it, unless it is a published entry point.
8. **The code speaks.** A comment is there only where the reasoning, a decision or the workings would be misread without it (`/STYLE_GUIDE.md`, "Comments"). No file headers, and no prose on the fields of a type: what an app author needs to know of an exported type is in the package's `DOCS.md`.

**How something new gets in.** In this order, and before any of it is written:

1. Name the question it answers. It goes in the module that owns that question (a package's `DESIGN.md` says which module owns what; moss's is "How the code is laid out").
2. If it answers none of them, it is a **feature**: a directory of its own, an entry point of its own, and it reaches the core only through a seam. The core never imports it, reads or writes no row of its tables, and holds no setting of its own for it. The tables that are a feature's it names on itself, and its seams reach those and no other.
3. If the seam it needs is not there, the seam is the first change, on its own, added to the module that owns the answer.
4. A new export is a decision, not a side effect of a file needing a name: it is a line in the package's `api.txt` in the same change, and it is documented under its entry point.
5. A statement outside vex is an entry in the ledger of `scripts/check-raw-sql.mts`, with its reason, or it does not exist. The reasons that hold are a credential read before anybody is signed in, an engine's own store, and a migration.
6. If it fits nowhere, the architecture is wrong. Say so, and propose the refactor before writing the feature. A refactor is considered every time; adding on top of what is there is how the one function got to 1,345 lines.

A defect found on the way gets a test that fails first. A commit moves code or changes behaviour, never both.

**The gates.** All four run in `pnpm verify` and in CI.

| Run | It fails when |
|---|---|
| `pnpm check:modules` | a file other than `index.ts` sits at the top of `src/`; a module imports a file inside another module instead of its door; a module imports one the table does not give it; the table has a cycle; the core imports a feature |
| `pnpm check:api` | an entry point exports a name that is not in the package's `api.txt`, or `api.txt` names one that is no longer exported; an entry writes `export *` |
| `pnpm check:raw-sql` | a file outside the script's ledger holds a statement or a call on a database pool, or a file in the ledger holds more or fewer than its line says |
| `pnpm lint` | in moss's `src/`, or tide's Postgres store or driver: a type assertion other than `as const`; an `any` that becomes a typed value; a written type predicate; a non-null `!`; a `function` declaration; a function over 300 lines, a file over 400 lines of code, a line over 200 wide; an inline directive that switches a rule off |

The lint reads types, and a type from another package of the repository is read from its `dist`: `pnpm build` first, as `pnpm verify` and CI do.

Rules 3, 4 and 8 have no gate. They are what a review reads for. What two processes do to each other is in no package's tests either: those run on PGlite, which has one connection.

`check:raw-sql` sweeps every package but vex and strata, where SQL lives. `check:modules` and `check:api` hold moss. A package joins `check:modules` by being made of modules and getting an entry in `PACKAGES`; it joins `check:api` by an entry in `ENTRIES` and `pnpm check:api --write`.
