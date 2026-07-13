# Mythos — plan

A pastel todo app on nisc. The twist: the todo list is a garden. Every todo is
planted with a doodle glyph; open todos are sprouts, overdue ones wilt, done
ones bloom into a persistent garden view. The app's palette shifts with
workload, and completing todos builds a daily combo and a day streak.

## Decisions (interview, 2026-07-08)

| # | Decision | Answer | Source |
|---|----------|--------|--------|
| D1 | Data layer | PGlite in the browser, in-memory, seeded at boot | user brief |
| D2 | Endpoint style | URL endpoints (`/api/...`) served by an in-process handler table | user |
| D3 | Reads | Vex, warm-only — hand-authored cache entries prewarmed at boot; a cache miss throws | user |
| D4 | Writes | Plain Zod-validated handlers doing parameterized SQL | user |
| D5 | Routing | None — shell state is the only truth | user |
| — | Twist | Garden + mood palette + combo streaks (all three, combined) | user |

Consequences accepted with D1: single browser profile, no sync, no auth.
Note: the lab convention (fixtures pin "today", prewarmed cache = seed data)
implies **ephemeral** data — the database is rebuilt and reseeded on every page
load. Persistent PGlite (`idb://`) is a possible follow-up; it conflicts with
reseeded fixtures, so it was not assumed.

Derived choices recorded for review, not asked (they follow from the twist
answers): canvas arrangement (chrome / main / overlay), one form action for
create+edit, delete-with-confirm on an overlay. The todo form is hand-laid
rather than Loom-compiled: four fields, app-specific triggers (create vs update
branch, change-channel emits) and the pastel kit outweigh compiling a
schema this small.

## Scope

- Single user, no auth, no AI features (D3 keeps reads Vex-shaped if that changes).
- Entities: `todos` only —
  `id uuid, title text, notes text, due_date date?, bloom text, done bool, done_at timestamptz?, done_on date?, created_at timestamptz`.
  `bloom` is a doodle kind stamped by the create handler; `done_on` is stamped
  by the done handler (derivation owned by the write path so streak reads stay
  plain SQL).
- Seed: ~12 todos around `CURRENT_DATE` — some done on consecutive past days
  (streak), one done today (combo), some open with future dues, some overdue.
- "Today" is read from the database once at boot and injected as ambient
  context (transform socket + Vex request context). No wall-clock comparisons.

## Views (actions on canvases)

Canvases: `chrome` (topbar), `main` (patch ↔ garden), `overlay` (modals).

- `topbar` — title, Patch/Garden tabs, mood chip, combo meter, streak badge, New button.
- `todo-list` ("the patch") — open todos: check to complete, edit, delete-with-confirm; done section collapsed away (done lives in the garden).
- `todo-garden` — every todo as a doodle: sprout (open), wilt (overdue), bloom (done). Click a sprout to complete (confetti), a bloom to replant (reopen).
- `todo-form` — create bare / edit seeded (raw values round-trip). One action, `input` declared.
- `todo-confirm-delete` — overlay confirm.
- `modal-frame` — fragment chrome for overlay actions.

## Reads (Vex cache entries, all prewarmed)

| Entry | Shape (the cache key) | Notes |
|---|---|---|
| `todosOpen` | `[{ todo_id, title, notes, bloom, due_date, due_display, overdue }]` | overdue computed SQL-side vs `$context.today` |
| `gardenTodos` | `[{ todo_id, title, bloom, stage, when_display }]` | stage: bloom/wilt/sprout via SQL case |
| `todoStats` | `{ open_count, overdue_count, done_today, mood }` | flat sum-of-case aggregates (no parameterized subqueries); mood derived in the mapping |
| `doneDays` | `[{ done_on, today }]` | distinct done days desc; streak derived in the endpoint's response transform |

One reader: `POST /api/query` `{ fingerprint, context }` → engine.execute, replay-only (`locked`).

## Writes (plain handlers, change channels)

| Endpoint | Handler | Emits (client, on success) |
|---|---|---|
| `POST /api/todos` | insert; stamps id, bloom, created_at | `todos-changed` |
| `PUT /api/todos/:id` | update title/notes/due_date | `todos-changed` |
| `POST /api/todos/:id/done` | set done + done_at/done_on (or clear) | `todos-changed`, `todo-bloomed` (complete only) |
| `DELETE /api/todos/:id` | delete row | `todos-changed` |

Every displaying action listens on `todos-changed` and re-reads. `todo-bloomed`
drives the confetti burst and meter pulse.

## Kit (domain-blind primitives)

Surface (palette CSS vars), Stack, Text, Card, Button, Input, TextArea,
Checkbox, Chip, Meter, Doodle (glyph kind × stage), Confetti (burst on prop
change). Moods: mint (calm) → butter → peach (busy) → blush (overloaded).

## Order of work

1. ✔ Interview → this file.
2. Scaffold: package, vite (crypto shim, PGlite exclude), boot, shell, placeholder.
3. Kit against a kitchen-sink action.
4. Data layer: schema+seed, two pools, engine+scope, entries, prewarm, `/api` fetch table; prove `todosOpen` end-to-end.
5. Actions: topbar → list → garden → form → confirm.
6. Writes + channels; prove create → announce → re-read.
7. Dev checks (`src/dev/*-check.ts`, tsx, exit non-zero) + empty states + polish.
