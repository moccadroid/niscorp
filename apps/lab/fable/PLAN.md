# Fable — Build Plan

A todo list app. Deliberately small: one entity, one list, one form. It exists to show the minimal nisc application — every rule of /AGENTS.md observed, nothing else added. Relay is the maximal exemplar; Fable is the floor.

## Decision points

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Data layer | PGlite in the browser | User-specified. Same recipe as Relay: pool shim, node:crypto shim, seed at boot. |
| D2 | Endpoint style | URL endpoints | AGENTS.md-recommended default; the in-process `fableFetch` swaps for a real server without touching an action. Delegated by user ("go"). |
| D3 | Reads | Vex, prewarmed cache, **warm-only** | User-specified. No `generateDsl`/`mapToShape` hooks wired — a novel shape throws instead of reaching for an LLM, which turns discipline breaks into loud errors. |
| D4 | Writes | Plain endpoint handlers | One entity, three writes — Relay's declarative mutation engine buys nothing here. Zod `.strict()` bodies, parameterized SQL, `done_at` stamped by the endpoint. Delegated by user ("go"). |
| D5 | Routing | None | Single-surface app; nothing worth an address. Delegated by user ("go"). |

D2/D4/D5 were delegated, not answered explicitly — flagged to the user, revisit on request.

## Data model

One table (`src/vex/schema.ts`).

| Column | Type | Notes |
|---|---|---|
| `id` | text pk, uuid default | DB mints ids on create; shapes alias it `todo_id` per the Vex id-field rule |
| `title` | text not null | |
| `notes` | text | nullable |
| `priority` | text | `low` / `medium` / `high` (CHECK) |
| `due_date` | date | nullable |
| `done` | boolean | default false |
| `done_at` | timestamptz | stamped by the set-done handler, never client-supplied |
| `created_at` | timestamptz | default now |

The seed (`src/vex/seed.ts`) is curated rows hanging off a FIXED reference day, `TODAY_ISO = 2026-06-20` — overdue, due today, upcoming, dateless, done. The shell's transform socket injects the same value as ambient `$.today`; nothing compares to the wall clock. `SEED_COUNTS` exports the buckets so the dev checks assert against the seed's own source of truth.

## Reads (Vex cache entries, prewarmed — `src/api/todos.ts`)

Every entry under a named fingerprint (the cache key); the mapping owns the result shape; date formatting lives in the mapping via `lib/format.prism.ts`.

- `todosOpen` — open todos, due-date asc (dateless last), computed `overdue` flag (in the DSL — only the query sees `$context.today`).
- `todosToday` — open todos due on or before today (today + overdue backlog); a const `today: true` marker keeps the shape distinct.
- `todosDone` — done todos, `done_at` desc; `done_at_display` replaces the flag.
- `todoStats` — open / due-today / overdue / done counts as conditional sums over ONE flat scan. Not cross-joined COUNT(*) subqueries: Vex restarts parameter numbering inside each `from` subquery, so two subqueries both using `$context.today` collide on `$1` (platform bug, reported).

All three list entries take `q` (search, `ilike`). Prewarmed by `buildCacheSeed()` (`src/api/index.ts`): compile mapping → `prism_ir`, INSERT into `vex_cache` at boot.

## Writes (URL endpoints, plain in-process handlers — `src/vex/http/writes.ts`)

- `POST /api/todos/save` — create-or-edit: null `todo_id` inserts, non-null updates. Body `TodoSaveBody`.
- `POST /api/todos/set-done` — flips `done`, stamps/clears `done_at` server-side. Body `TodoSetDoneBody`.
- `POST /api/todos/delete` — by id. Body `TodoDeleteBody`.

Bodies are Zod `.strict()` contracts living in `src/api/todos.ts` next to the read entries. Every write's success path emits `todos-changed`; the list re-reads rows and stats on it.

## Actions

All UI is actions on canvases. Canvases: `topbar`, `main`, `modal` (overlay). One fragment: `modal` (dialog chrome — overlay, card, title, ✕).

- `topbar` (chrome) — wordmark + New todo button; pushes `todo.form` onto `modal` with the fragment.
- `todos` (domain) — stat row + one list card. Scope tabs (Open / Today / Done) live in the card toolbar and re-run the read by picking the shape (`todos.prism.ts` `$case`); search re-runs it in place. Inline done checkbox; row ⋯ menu → Edit (seeds the form from the row's raw fields) / Delete (stashes the id, confirms first). Listens on `todos-changed` and `confirm-delete`.
- `todo.form` (domain) — ONE form, create and edit; blank `id` creates. Declares `input` (JSON Schema from Zod). Its `.prism.ts` seam maps form data → save body (`due` → `due_date`, empties → null).
- `confirm-delete` (shared) — display-only confirm; emits `confirm-delete`, the opener runs the write. Declares `input`.

## Order of work (done)

1. PLAN.md
2. Scaffold — boot, shell, canvases, registry
3. Kit — generic primitives only (`src/ui`), no domain nouns
4. Data layer — PGlite + seed + warm-only engine + prewarmed entries
5. Actions — list, form, chrome, confirm
6. Writes — handlers + `todos-changed` round-trip
7. Checks

## Checks

Headless scripts under `src/dev/`, run with tsx against the REAL shell (no browser, no mocks); `[pass]`/`[fail]` per assertion, non-zero exit on failure.

- `pnpm check:boot` — every prewarmed entry compiles + serves from cache; shell mounts; rows/stats match `SEED_COUNTS`; scopes and search re-read in place.
- `pnpm check:write` — create → `todos-changed` → re-read; complete/reopen via the checkbox moves rows between scopes and moves the stats; edit round-trips; delete confirms then removes.
- `pnpm check:form` — bare form = create defaults, seeded form = edit with raw values; cancel never writes; every declared `input` ⊆ `data` keys (rule 11), mechanically.
- `pnpm check` — all three. `pnpm typecheck` and `pnpm build` are green.
