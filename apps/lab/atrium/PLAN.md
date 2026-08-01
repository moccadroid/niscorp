# Atrium — the plan

A guest-and-staff platform run by a **third-party integrator**. One deployment, many
hotels, many PMS backends, five audiences, one URL. What an audience sees is not a
feature flag anywhere in the UI — it is the intersection of four resolutions, and the
whole point of the app is that **shipping is a data change**.

## What this proves

1. **An action exists for a principal or it does not.** Never a disabled control, never
   a capability field read by a layout.
2. **Shipping is a row write.** A PMS integration goes live → the actions it unlocks
   appear on already-open shells, no deploy, no reload.
3. **A connector is a separate service, and the app DISCOVERS it.** New integrations
   deploy on their own clock and the app pulls what they offer — capabilities,
   actions, queries, surfaces, menus — over the wire, holding no built-in knowledge
   of any vendor. The main app never goes down, and it degrades structurally when a
   connector is unreachable.
4. **The AI places, it never generates.** The concierge selects and parameterizes
   actions from the resolved catalog. It cannot invent a `taxi.arranged` that has no
   basis in reality.

## Decision points

| # | Decision | Tier | Answer |
|---|---|---|---|
| D1 | Posture | answered | moss server app. The shell runs server-side; the browser is a canvas terminal. |
| D2 | Environment | answered | PGlite + vex's postgres cache, seeded at boot. The integrations service is a **separate Node process** talking HTTP, and the app pulls its bundles from it through an intake gate (`server/intake.ts`). |
| D3 | Reads | answered | Vex entries, replay-only. Warm-only — no LLM hooks wired, so an unknown fingerprint is a 500 rather than a silent generate. |
| D4 | Writes | answered | Vex mutation entries. Every write is a fingerprint replay. |
| D5 | Routing | derived | No address-bar sync. Shell state is the truth; the demo is driven by conversation and pushes, not by URLs. |

## Answered in the interview

- **No auth.** Relay-style name picker; the login page describes each role. A guest
  token identifies a *guest*, and their stays hang off it. Consequence accepted: the
  link is a bearer credential, so nothing sensitive lives on the guest surface.
- **No generation.** Place / select / fill / adjust only.
- **Design language.** Light, warm, hotel — off-white grounds, thin rules, a serif
  display face, one restrained accent per property. Not a dark ops console, including
  for staff.
- **Nothing outside `apps/lab/atrium`.** New machinery gets built here; promotion into
  a package is a later, separate decision.

## Derived

- **The capability vocabulary is ours, not a PMS's.** `key.issue` — not "Opera mobile
  key". Connectors map into it. That is what makes this an integrator rather than a
  reseller, and it is why one guest layout serves both PMSes.
- **Four-factor existence.** A slot resolves onto a shell iff: a connector offers the
  capability and has it switched on, the property enabled it, the charter grants the
  audience the action, and the stay state permits it.
- **Charter is the ceiling; the database is the surface.** The charter says which
  action ids a role may ever hold. The resolved slot table says which are placed right
  now. Both are needed: the charter is compiled and verified at boot, the slots move at
  runtime.
- **Live sessions get told.** A capability flip publishes on a channel into every open
  shell. Implemented in-app (`server/live.ts`) over the manifest's `functions(session)`
  seam — moss is untouched.
- **The concierge is a matcher, not a model.** It scores the guest's phrase against the
  resolved slot catalog and returns a *selection*, with its parameters filled from the
  stay. This is the seam `@niscorp/signal` plugs into later; the contract (resolved
  catalog in, chosen slot id + context out) does not change when it does.

## Roles

| Role | Who | Surface |
|---|---|---|
| `public` | not signed in | the name picker |
| `guest` | a guest with a stay | mobile: their stay, and whatever their property can actually do |
| `desk` | front office | the issue board, the arrivals list, a guest's whole stay on one pane |
| `service` | housekeeping / maintenance | phone: assigned tasks, three big targets |
| `ops` | hotel operations manager | occupancy, issues by type, rooms out of order, per-property capability switches |
| `vendor` | us, the integrator | the deployment console: connectors, versions, capability matrix, live rollout |

## Data model

Mirrored from a PMS (we do not own the truth): `guests`, `stays`, `rooms`, `folio_lines`.
Each carries `property_id` + `external_id` + `synced_at`.

Ours: `properties`, `connectors`, `connector_capabilities`, `property_capabilities`,
`capabilities`, `surface_slots`, `issues`, `tasks`, `messages`, `staff`.

## Order of work — done

1. Schema + seed: two properties, two connectors, one capability deliberately dark. ✓
2. Vex entries: capability resolution first — the spine. ✓
3. Kit: light hotel palette, locked before any feature. ✓
4. Guest surface, then desk, then service, then ops, then the vendor console. ✓
5. The live flip, end to end, with a check. ✓

Six checks, 96 assertions, all green. `DESIGN.md` has the architecture.

## Found during the build

Three things that were not visible from the interview and are worth carrying
forward:

- **`behaviors` cannot express this app's row rules.** They are property-shaped,
  and moss injects only `userId` and `today` into the scope context. Tenancy
  holds one layer up instead — the shell is server-side, so seeded action data is
  not client-authorable — which is sound but is not where enforcement belongs.
  The fix is a package change and is deliberately not made here. Full note in
  `DESIGN.md`.
- **Nothing crosses a session.** moss gives a session `publish` into its own
  shell only. Both a capability release and a guest's report have to reach other
  principals, so atrium built a forty-line property-scoped bus on the
  `functions(session)` seam. Whether moss should own that is an open upstream
  question.
- **Nova resolves dynamic navigation targets natively.** `push: { action:
  '{{@event.payload.action_id}}' }` works, which is what makes "the concierge
  places a resolved row" need no machinery at all. It was the one thing the
  design hinged on and it was already there.

## Deliberately not built

- Ring-2 served variants for the staff chrome (boot-input booleans instead — the
  stopgap AGENTS.md names).
- A terminal target. Free, and a gimmick here.
- Any generation path. Place / select / fill / adjust only, by decision.
