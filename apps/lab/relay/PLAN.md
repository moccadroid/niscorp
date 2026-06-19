# Relay v1 — Build Plan

Internal build plan for the first lab product. For the platform thesis behind it, see [/PRODUCTS_2.md](../../../PRODUCTS_2.md).

Relay is a CRM clone — Salesforce/HubSpot surface, Linear-grade dark skin — built entirely on `@niscorp/nova` + `@niscorp/vex` + `@niscorp/loom`, running fully in the browser on PGlite. **v1 ships with no AI.** That is deliberate: Relay is the control group. If we hold the declarative discipline below, the AI assistant (Ray, v2) slides in with near-zero per-feature wiring — and that slide is the proof the architecture works.

## The experiment

> **Build nothing for Ray.** Pure CRM. Every screen a Nova layout, every read a Vex shape, every write an action endpoint, the action catalog stored as queryable data. Then v2 adds Ray and we measure how little it took. Where Ray struggles is where an engineer broke discipline. Ray is the lint.

Success for v1 = it feels like a **product, not a demo** (the whole point of going big on surface area), and the v2 Ray-readiness checklist at the bottom is all green by the time we finish.

## Principles (the discipline that makes v2 free)

1. **Every screen is a Nova action + layout.** No bespoke React screens, no app logic in components.
2. **Every read is a Vex shape.** No SQL in components, no fetch-and-massage. The shape an action renders *is* the query.
3. **Every write is an action with an `fn` endpoint.** No inline mutations. A human click fires the endpoint; the endpoint is opaque (PGlite today, a server tomorrow — Relay doesn't care, and neither will Ray).
4. **The action catalog is data in the DB,** each with a description and scope, from day one. v1 navigates it by id; v2 retrieves it by meaning.
5. **React is only the renderer.** The kit registers components under Nova roles. Layouts/actions stay pure JSON, authored anywhere.

## Architecture

```
                    ┌─────────────────────────────────────────┐
   PGlite (WASM)    │  data tables  +  actions catalog table   │
   in the browser   └─────────────────────────────────────────┘
        ▲                         ▲                  ▲
        │ pool shim               │ reads            │ writes
        │                  ┌──────────────┐   ┌───────────────┐
        └──────────────────│  Vex engine  │   │ fn endpoints  │
                           │ scope+cache  │   │ (mutations)   │
                           └──────────────┘   └───────────────┘
                                  ▲                  ▲
                    fill data     │                  │ invalidate + refetch
                 ┌────────────────┴───────┐          │
                 │  Data-source resolver  │          │
                 │  providers: vex|static │  ← THE SEAM (extraction candidate)
                 └────────────────────────┘          │
                                  ▲                  │
                           ┌──────┴──────────────────┴──────┐
                           │     Nova shell + actions        │
                           │  canvases · layouts · triggers  │
                           └─────────────────────────────────┘
                                          ▲
                           ┌──────────────┴──────────────┐
                           │  Relay UI kit (Linear dark)  │  React = renderer only
                           └─────────────────────────────┘
```

- **PGlite + Vex.** Same recipe the showroom proved: real `@niscorp/vex` engine + `createPostgresAdapter` over a `{ query }` pool shim on PGlite; `pgvector`/`pg_trgm`/`fuzzystrmatch` extensions loaded at construction; the `node:crypto`→`@noble/hashes` Vite shim. Scope policies wired even though v1 is single-user (proves the mechanism, sets up multi-role later). Shape cache prewarmed for the common views so they're instant.
- **The data-source seam** is the one genuinely new piece, and we build it *here in the lab*, abstract on purpose. A view action declares a `source` descriptor; a resolver fills the action's data from it. v1 ships a `vex` provider (shape → Vex query → rows) and a `static` provider. It is deliberately **not** "Nova calls Vex" — it's a provider interface, so the same hook could later fill an action from a REST call or a computed function with no Vex at all. This is the seam we watch for extraction into nisc (a Nova lifecycle hook? a Vex helper? its own tiny harness? — v1 tells us).
- **fn endpoints.** A registry of mutation functions; each takes the action's bound data, validates against the action's Zod input schema, writes to PGlite, returns a `Result`. On success, affected Vex views invalidate and refetch.
- **Loom earns its keep authoring.** The add/edit mutation forms are compiled from the entity Zod schemas with `@niscorp/loom` rather than hand-laid — fast to author, and a real dogfood of Loom inside a product.

## Data model

PGlite schema, ~12 tables, coherent relationships:

| Table | Key columns |
|---|---|
| `users` | id, name, email, avatar_url (owners; single demo user signed in, but data has a team) |
| `companies` | id, name, domain, industry, size, owner_id, created_at |
| `contacts` | id, first_name, last_name, email, phone, title, company_id, owner_id, created_at |
| `pipelines` | id, name, is_default |
| `stages` | id, pipeline_id, name, position, win_probability |
| `deals` | id, title, company_id, primary_contact_id, value, currency, stage_id, owner_id, close_date, status (open/won/lost), created_at |
| `products` | id, name, sku, unit_price |
| `deal_products` | id, deal_id, product_id, quantity, unit_price (line items) |
| `activities` | id, type (call/email/meeting/note), subject, body, contact_id, company_id, deal_id, owner_id, occurred_at |
| `tasks` | id, title, due_date, done, assignee_id, contact_id, company_id, deal_id, created_at |
| `lists` | id, name, kind (static/smart) |
| `list_members` | id, list_id, contact_id |
| `actions` | id, name, description, scope, definition (jsonb), kind (view/mutation) — the **catalog** |

(v2 adds an `embedding vector` column to `actions`; everything else is v1.)

## The seed

A `seed/` module the bootstrap runs once on boot:

- `schema.sql` — the DDL above + extensions.
- `data.ts` — faker-style generator with **coherent** relationships and dates clustered around today (2026-06-13): ~40 companies, ~200 contacts, ~120 deals spread across stages and statuses, ~600 activities on a believable timeline, ~150 tasks (some overdue, some today, some upcoming), 3–4 products, a default pipeline with 6 stages. Enough that every list, board, and chart looks alive.
- `actions/*.ts` — the action catalog as typed modules (the source of truth, version-controlled, reviewable — i.e. "team-authored"). The bootstrap inserts each into the `actions` table with `{ id, name, description, scope, kind, definition }`.
- `bootstrap.ts` — assemble PGlite (extensions) → run DDL → seed data → seed catalog → `engine.introspect()` → prewarm the common shapes' cache. App boots into the dashboard with zero spinner.

Seeding the catalog into the DB (not just an in-memory registry) is the cheap forethought that makes v2 free: v1 loads actions into the Nova registry *from* the table; v2 adds embeddings and a Vex semantic shape over the same table, and `findAction` exists.

## The Relay UI kit (Linear-dark)

A real design system, registered as Nova components. Dark-first: deep neutral background, hairline borders, one accent (indigo/violet) with restrained glow, tight type scale, micro-motion on hover/open.

- **Primitives:** Button (variants), IconButton, Input, Textarea, Select/Combobox, MultiSelect, Checkbox, Switch, DatePicker, Avatar, AvatarGroup, Badge/Pill (stage, status), Tag, Tooltip, Spinner, Skeleton.
- **Composite:** Table (sort/filter/row-select), StatCard (KPI), KanbanBoard, ActivityTimeline, Tabs, Dialog, Drawer/Sheet (right-rail detail), Toast, Menu/Dropdown, Popover, Sidebar/Nav, Breadcrumbs, EmptyState, Chart (bar/line/donut).

The kit lives in the lab (`src/ui/`) for v1; if a second lab product wants it, that's the extraction signal.

## Feature set (go big — this is what stops it feeling like a demo)

Nine product areas, each a set of view actions (Vex-backed, self-loading) plus the mutations it exposes:

1. **Dashboard / Home.** KPI row (open pipeline value, won this month, activities this week, tasks due), a "today" task list, a recent-activity feed, a pipeline-by-stage mini chart. Several Vex shapes, one screen — sells "real product" on first paint.
2. **Contacts.** Sortable/filterable list; detail view = profile + company link + associated deals + activity timeline + open tasks. Inline actions: log activity, add task, edit, assign owner, add to list.
3. **Companies.** List; detail = overview + contacts at company + deals + activity. Actions: add contact, create deal, log activity, edit.
4. **Deals.** **Kanban board by stage (the showpiece layout)** with drag-to-move (a `move_stage` action); list view; detail = deal info + line items (products) + activity + tasks + stage history. Actions: create, move stage, mark won/lost, add product, set close date, assign owner.
5. **Activities.** Global timeline/feed, filterable by type and entity. Action: log call/email/meeting/note.
6. **Tasks.** Today / overdue / upcoming buckets; complete, reschedule, reassign, create.
7. **Pipeline settings.** Configure stages (add/rename/reorder) — shows config-editing actions, and a natural future Loom/Ray target.
8. **Insights.** A few real charts off Vex aggregates: pipeline by stage, win rate, activity volume over time, deals by owner.
9. **Global search.** Cmd-K search across entities via Vex `fuzzy`/`semantic` filters. **This dogfoods the exact retrieval Ray will use for `findAction`** — build it here against entities, reuse the mechanism for actions in v2.

## Action catalog (flood the db)

~30 mutation actions, grouped:

- **Contacts:** create, edit, delete, assign_owner, add_to_list, log_activity, add_task.
- **Companies:** create, edit, delete, assign_owner, add_contact, create_deal.
- **Deals:** create, edit, move_stage, mark_won, mark_lost, add_product, remove_product, set_close_date, assign_owner, add_task, log_activity.
- **Tasks:** create, complete, reschedule, reassign, delete.
- **Activities:** log_call, log_email, log_meeting, add_note.
- **Pipeline:** add_stage, rename_stage, reorder_stage.
- **Lists:** create_list, add_member, remove_member.

Plus the ~15 view actions behind the feature areas. All in the `actions` table.

## Build order

- **Phase 0 — Scaffold.** Wire PGlite + Vex into `apps/lab` (deps: `@electric-sql/pglite`, `pglite-pgvector`, `@niscorp/vex`, `@niscorp/loom`, `@noble/hashes`; the `node:crypto` shim). Bootstrap renders a raw Vex query result. *Done when:* a Vex shape returns seeded rows in the browser.
- **Phase 1 — Kit.** Build the Linear-dark primitives + key composites against a kitchen-sink page. Lock the aesthetic. *Done when:* the kitchen sink looks like a premium SaaS.
- **Phase 2 — Nova + the seam.** Register the kit under Nova roles. Build the data-source resolver (`vex` + `static`). Render the contacts list from a Vex-backed view action that self-loads. *Done when:* a layout in the DB renders live data with no bespoke fetch.
- **Phase 3 — Shell.** Sidebar nav + main canvas + right-rail drawer. Nav items push view actions; canvas arrangement is data. *Done when:* you can navigate the whole app by hand.
- **Phase 4 — Views.** Dashboard, contacts, companies, deals (board + list + detail), activities, tasks, insights. All Vex-backed. *Done when:* every area renders real seeded data.
- **Phase 5 — Mutations.** The fn endpoints + Loom-compiled forms; create/edit/move/log/complete wired; invalidate+refetch on success. *Done when:* you can run the CRM by hand end-to-end — add a contact, create a deal, drag it across the board, log a call, complete a task.
- **Phase 6 — Polish + search.** Empty states, skeletons, toasts, transitions, keyboard nav, Cmd-K Vex search. *Done when:* it feels finished, not scaffolded.
- **Phase 7 — Ray-readiness pass.** Verify the checklist below. No AI yet — just confirm the ground is laid.

## What we watch for nisc (the extraction list)

v1 is also reconnaissance. By the end we should know where each of these belongs:

- **The data-source seam** — Nova lifecycle hook, Vex helper, or its own harness? (The provider abstraction is the bet that it's harness-shaped.)
- **Action catalog persistence + (v2) semantic retrieval** — does this want to be a blessed pattern?
- **The fn-endpoint + invalidate/refetch loop** — does Nova want this in the box?
- **The Relay UI kit** — does Nova want a blessed kit, or stay kit-agnostic?

Build it in Relay, see what drops out, *then* decide what becomes a nisc layer.

## Out of v1 (explicitly)

Auth, multi-user, sockets, a real backend, settings sprawl, email — and **Ray / any AI.** Those are v2+ and Products-2 territory.

## Ray-readiness checklist (the v2 proof, set up by v1)

If all of these are true when v1 ships, Ray is mostly `findAction` + a conversational Cortex agent + the shell ops we already have:

- [ ] Every capability is an Action in the catalog table, with a description and scope.
- [ ] Every read is a Vex shape; nothing fetches data outside Vex.
- [ ] Every write is an `fn` endpoint fired by a human click; nothing mutates inline.
- [ ] The shell exposes push / arrange / load-view operations (it already does).
- [ ] Scope is wired through Vex (single-user now, role-ready later).
- [ ] The action catalog is queryable as data (so adding an `embedding` column + a semantic shape *is* `findAction`).

The day that list is green, we drop Ray in and find out if we were right.
