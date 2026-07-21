# Moss — Design Document

## Purpose

A lightweight runtime that serves *capabilities* instead of code. A principal
logs in, a charter resolves, and what arrives over the socket is their
application: the actions they may use, the data those actions may touch, live,
revocable, and identical in mechanism for humans and AI agents.

**One sentence:** the resolved catalog is the application.

**Why it had to exist.** The stack was server-shaped and had no server. Actions
are wire-ready data and nothing wired them; the charter resolved but had nowhere
trusted to execute; vex's multi-user machinery was built and dormant; server
functions had no host; there was no transport anywhere. Six mechanisms, all
built or specified, all homeless — and every app rebuilt the same wiring (its
own shell, its own vex host, its own identity stub). Moss is the missing organ:
the trusted place where the charter executes, the shell runs, and existence is
served.

---

## The inversion

A traditional application server hosts code and exposes endpoints. Everyone
receives the same application; authorization is a wall of checks around it. Moss
inverts the relationship on four axes.

### 1. It serves existence

The unit served is the action — the complete behavioral contract (layout +
triggers + endpoints + input). A principal's resolved catalog **is** their
application. Deny-by-nonexistence, made true by a server rather than cosmetic in
a client: an ungranted action is not hidden or disabled, it is absent. There is
no `if (canAccess)` to forget, because the thing to guard was never sent. The
warehouse kiosk granted two actions is not a locked-down app; it is a two-action
app.

### 2. Deployment is a data operation

Every field of the manifest is an authored artifact — the charter, the action
definitions, the layout variants, the prewarmed API surface, the shell's
canvases. Publishing a change is a write to that data; moss derives the rest.
Consequences:

- **No version skew.** The shell and the definitions it runs live server-side;
  the client is a thin terminal that rarely changes.
- **Rollback is a pointer move.** The library is versioned; "published" is a
  pointer per (artifact, tenant, channel), and reverting moves it back.
- **The release artifact is a diff, not a build log.** Because permissions and
  UI are closed data, a publish can render its consequences in concrete terms —
  *"crm.quotes → gained by: sales, intern, ray."* A human approves that.

Today the manifest is a compiled constant, seeded as generation 0; the artifact
library that makes publish a runtime write is specified and unbuilt (see below).
The mechanism is already the pure function it needs to be: resolution and shell
construction are derived from an immutable manifest, so a new generation is a new
manifest, and the per-principal memos die with it — no invalidation protocol.

### 3. One gate, every kind of principal

The resolved catalog feeds the human's shell, an agent's tool policy, the
function gate, and the boot verifier from **one document**. User permissions, AI
guardrails, feature flags, and plan entitlements collapse into one charter
resolving to one set, per principal.

### 4. The shell runs on the server

Nova's core is headless and its interchange is serializable (`RenderNode[]`
down, `NovaEvent` up), so the shell executes server-side and the client is a
canvas terminal: a registry, a socket, a renderer. State is authoritative — the
LiveView move, but streaming semantic trees, so the terminal is tiny and
swappable — four targets ship: the app's React kit (`terminal/react`),
nova's plain-DOM kit (`terminal/dom`), a line REPL (`terminal/tty`), and a
full-screen TUI (`terminal/ink`). Swappable is literal: `mountTerminal`
hot-swaps targets over one wire, the session and current trees surviving the
swap. The DOM target is the proof the terminal is trivial — nova's DOM adapter
and default kit, zero framework, zero config.

The cost is the round trip, and two rules cover the one interaction that cannot
wait for it: the terminal never overwrites the value of the focused input when a
new tree arrives (bound inputs are identified by `model.path`), and `ui:model`
events debounce. A canvas — or a whole app — may also opt *out* and run its shell
in the browser, with vex as the enforcement floor: this is where offline and
zero-backend PGlite live. It is an explicit per-canvas degrade, not a mode menu;
one screen can mix client-side chrome with authoritative server canvases —
**authority islands**. The frame doesn't care: a canvas slot renders a tree and
is indifferent to whether it came from a local shell or a socket.

---

## Derivation over configuration

The organizing principle: an app hands over **artifacts** and an
**environment**, and everything mechanical is *derived* — never configured.

- The **data layer** stands up from what's present: the database's seeded
  `vex_cache` is the API surface (nothing is generated), and the grantable set
  is the introspected schema × vex's verb leaves. No table list is authored.
- **Per-principal resolution** is the charter applied at login: roles from the
  assignment rows, granted action ids (with a content-hash version token), the
  compiled vex scope policy, and the granted layout variants (ring 2). Pure;
  memoized because the documents are static per process.
- The **component registry** on the server is name-only stubs, derived by
  walking the manifest's layouts (variants included, nova/reflect's
  `componentsOf` — the walk is shared, not re-derived) — the actual components
  live in the terminal.
- **Coherence is refused, not documented.** `createServer` runs `verifyCharter`
  (with nova's closure audit injected over effective definitions) and
  `verifyVariants`, and throws on errors. If it boots, it's coherent.

The test of the principle: moss adds no new vocabulary. Reads are vex, writes are
vex, compute is functions, UI is actions, permissions are the charter. The server
is the composition, not a fifth language.

### Ring 2 — served layout variants

Per-principal UI difference is existence (ring 1) or a served variant (ring 2),
never a runtime capability flag in a layout. A layout variant (`NiscApp.layouts`)
is `{ action, layout }` under a minted id; the charter's `layouts` section
selects who holds which. At shell build, moss substitutes the granted variant's
layout onto the definition *before* the shell exists, so every downstream render
and serialize is already per-principal and the terminal renders what it is served
— nothing on the wire says why a button is absent. The base layout is the floor
(the least-privileged holder's shape); variants enrich upward as grants, so
`extends` composes them and a forgotten grant fails closed. This is the charter's
extensibility paying off: one `Section` value, moss hands the universe in and
compiles it.

---

## The socket

The authority channel. Transport-blind: the protocol speaks through a
four-function `Connection` seam (`send`/`close`/`onMessage`/`onClose`), and the
RFC 6455 plumbing lives with each runtime's entry (`ws` on Node in `./node`,
Bun-native later). One connection per client carries every canvas — ten open
canvases are ten canvas ids on one pipe.

**Down:** `hello` (the resolved catalog on connect), `catalog` (declared for
catalog pushes — not yet sent; terminals know it and ignore it), `frame` (the
canvas arrangement — a served layout of `CanvasSlot` markers), `render` (a
canvas's tree), `session` (a login grant), `error`. **Up:** `event` (a
canvas-tagged `NovaEvent`), `publish` (a channel message).

Operational shape, all falling out of "the message is state, not history":

- **Backpressure.** At most one pending tree per canvas per connection; a newer
  render replaces it, never queues behind it. A diff stream could never drop an
  update this way.
- **Delivery.** Events are fire-and-forget; the tree is the confirmation. No
  acks, no replay after reconnect — a replayed intention against a changed screen
  is worse than a lost one, so reconnect simply re-sends the current trees.
- **Durability.** The projection (once built) is the durable thing; the shell is
  a warm cache rebuilt from definitions + projection. Evicting an idle shell and
  restarting the process are both safe — shells rehydrate on the next connection.
- **Emptiness.** A canvas whose layout renders no visible content is served as
  `[]`, so a terminal collapses chrome on `length` alone. An `ActionSlot` is a
  boundary, not content — visibility is decided by what's inside it.

Two design points worth naming:

- **Transport → shell addressing.** The wire tags every event with its canvas;
  moss stamps the canvas's *active instance* as the event's origin, and nova's
  own origin filter delivers it to that instance's triggers alone. The terminal
  never learns what an origin is — addressing translation is the host's job,
  where both vocabularies meet. This is why two instances of one action on
  different canvases don't cross-fire, with zero client-side logic.
- **Session lifecycle is capabilities, not channels.** The in-process function
  seam hands each session a `grant(token)` and a `revoke()`. A login function
  grants (the token goes down every connection as a `session` message; the
  terminals reconnect authenticated); a sign-out function revokes (every
  connection closes `4403`, the durable shell is evicted). The app calls
  capabilities; it never knows where the session machinery lives. On the wire,
  `4401` (stale token) and `4403` (sign-out) are the same recovery, not a
  retry: drop the token, reconnect anonymous — retrying with a stale token
  would loop forever.

## Server shells

One durable nova `Shell` per authenticated principal — the socket is ephemeral,
the shell survives disconnect (reattach re-sends the current trees, and N
attached connections receive the same frames: shared canvases are the same
mechanism). Anonymous connections get a throwaway shell, disposed on detach.

The shell is built from the manifest: canvases and fragments are data; a canvas's
`initial` may be a candidate list, and the first action the principal holds
mounts — so login is the anonymous principal's application (the charter's
`public` grant) by derivation, not a special case. `inputs(session)` is the app's
one per-principal boot hook. Endpoint calls ride the server's own HTTP surfaces
with the session's token — the server shell is just another principal-bound
client, enforcement included.

---

## The function seam

The `fn:` escape hatch runs server-side, in-process, next to the durable shell.
The manifest's `functions(session)` builds handlers once per session, closing
over the living shell, the caller's compiled scope policy, the environment, and
`grant`/`revoke`. Agents live here (their reads run under the caller's policy —
they see what the caller sees); keys are `.env`. This is deliberately the *side-
effect-ful, session-bound* half. The canonical, side-effect-free function — an
independently deployable endpoint under `/fns` — is specified and pending.

## What it refuses to be

| Temptation | Refusal |
|---|---|
| An auth provider | BYO identity. The server consumes a session token, never mints one; magic link is the default strategy. |
| A framework | An assembly point. The intelligence lives in the artifacts; the server resolves, serves, pushes, enforces. Component count stays single-digit. |
| A place where policy hides | Every opinion it enforces is a readable artifact: charter, scope policy, assertion. No annotations, no interceptor magic. |
| A second way to do anything | Reads are vex, writes are vex, compute is functions, UI is actions, permissions are the charter. Moss adds no vocabulary of its own. |

## Deliberately unbuilt

On the record, so nothing reads as finished that isn't:

- **The artifact library.** Versioned artifact rows + snapshots + a published
  pointer per channel, so publish is a runtime write, not a rebuild — the thing
  §2 ("deployment is a data operation") is building toward. The open decisions
  are tenancy overlays, draft/published channels, and live-shell migration on
  publish (nova needs a `replaceAction` that rebinds live instances without
  dropping their data). Verify-at-boot becomes verify-at-publish, same gates.
- **The `/fns` host** — named, side-effect-free, independently deployable
  functions under `/fns`, gated by catalog closure.
- **The projection model** — per-identity state held in the DB, written-and-
  pushed, seeded on login with no AI call, held while the principal is offline.
- **The working set (level streaming).** For large apps and AI context budgets,
  the catalog itself streams: serve the graph neighborhood of a principal's
  active actions now, fault the rest in on demand. Level streaming for humans is
  context management for models — one mechanism, two products.
- **Scale-out** beyond sticky sessions pinned by session id.

## Boundaries

Moss composes the other nisc packages and owns none of their concerns: charter
resolves and verifies, vex reads and writes under scope, nova is the UI (headless
core + a framework adapter), prism is the endpoint transform language. Moss is
the organ that was missing — the trusted place where the charter executes, the
shell runs, and existence is served. See [DOCS.md](DOCS.md) for the API.
