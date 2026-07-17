# Moss — Design Document

## Purpose

A lightweight runtime that serves *capabilities* instead of code. A principal
logs in, a charter resolves, and what arrives over the socket is their
application: the actions they may use, the data those actions may touch, live,
revocable, and identical in mechanism for humans and AI agents.

**One sentence:** the resolved catalog is the application.

The full design conversation — the six homeless mechanisms this package gives a
home, the projection model, scale-out — lives in the repo's `SERVER.md`. This
document pins the thesis and the built shape.

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
no `if (canAccess)` to forget, because the thing to guard was never sent.

### 2. Deployment is a data operation

Every field of the manifest is an authored artifact — the charter, the action
definitions, the prewarmed API surface, the shell's canvases. Publishing a
change is a write to that data; moss derives the rest. No version skew: the
shell and the definitions it runs live server-side; the client is a thin
terminal that rarely changes.

### 3. One gate, every kind of principal

The resolved catalog feeds the human's shell, an agent's tool policy, the
function gate, and the boot verifier from **one document**. User permissions,
AI guardrails, feature flags, and plan entitlements collapse into one charter
resolving to one set, per principal.

### 4. The shell runs on the server

Nova's core is headless and its interchange is serializable (`RenderNode[]`
down, `NovaEvent` up), so the shell executes server-side and the client is a
canvas terminal: a registry, a socket, a renderer. State is authoritative — the
LiveView move, but streaming semantic trees, so the terminal is tiny and
swappable (React, Svelte, native, TUI).

---

## Derivation over configuration

The organizing principle: an app hands over **artifacts** and an
**environment**, and everything mechanical is *derived* — never configured.

- The **data layer** stands up from what's present: the database's seeded
  `vex_cache` is the API surface (nothing is generated), and the grantable set
  is the introspected schema × vex's verb leaves. No table list is authored.
- **Per-principal resolution** is the charter applied at login: roles from the
  assignment rows, granted action ids (with a content-hash version token), and
  the compiled vex scope policy. Pure; memoized because the documents are static
  per process.
- The **component registry** on the server is name-only stubs, derived by
  walking the manifest's layouts — the actual components live in the terminal.
- **Coherence is refused, not documented.** `createServer` runs `verifyCharter`
  (with nova's closure audit injected) and throws on errors. If it boots, it's
  coherent.

The test of the principle: moss adds no new vocabulary. Reads are vex, writes
are vex, compute is functions, UI is actions, permissions are the charter. The
server is the composition, not a fifth language.

---

## The socket

The authority channel. Transport-blind: the protocol speaks through a
four-function `Connection` seam (`send`/`close`/`onMessage`/`onClose`), and the
RFC 6455 plumbing lives with each runtime's entry (`ws` on Node in `./node`,
Bun-native later). One connection per client carries every canvas.

**Down:** `hello` (the resolved catalog on connect), `frame` (the canvas
arrangement — a served layout of `CanvasSlot` markers), `render` (a canvas's
tree), `session` (a login grant), `error`. **Up:** `event` (a canvas-tagged
`NovaEvent`), `publish` (a channel message).

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
  capabilities; it never knows where the session machinery lives.

## Server shells

One durable nova `Shell` per authenticated principal — the socket is ephemeral,
the shell survives disconnect (reattach re-sends the current trees, and N
attached connections receive the same frames: shared canvases are the same
mechanism). Anonymous connections get a throwaway shell, disposed on detach.

The shell is built from the manifest: canvases and fragments are data; a
canvas's `initial` may be a candidate list, and the first action the principal
holds mounts — so login is the anonymous principal's application (the charter's
`public` grant) by derivation, not a special case. `inputs(session)` is the
app's one per-principal boot hook. Endpoint calls ride the server's own HTTP
surfaces with the session's token — the server shell is just another
principal-bound client, enforcement included.

---

## The function seam

The `fn:` escape hatch runs server-side, in-process, next to the durable shell.
The manifest's `functions(session)` builds handlers once per session, closing
over the living shell, the caller's compiled scope policy, the environment, and
`grant`/`revoke`. Agents live here (their reads run under the caller's policy —
they see what the caller sees); keys are `.env`. This is deliberately the *side-
effect-ful, session-bound* half. The canonical, side-effect-free function — an
independently deployable endpoint under `/fns` — is specified and pending.

## Deliberately unbuilt

On the record, so nothing reads as finished that isn't: the `/fns` host; the
per-identity projection model (DB-held, pushed on write, seeded on login);
scale-out beyond sticky sessions; a served component registry (so a terminal
loads an app's pixels at connect time rather than build time). The ladder is in
`SERVER.md`.

## Boundaries

Moss composes the other nisc packages and owns none of their concerns: charter
resolves and verifies, vex reads and writes under scope, nova is the UI (headless
core + a framework adapter), prism is the endpoint transform language. Moss is
the organ that was missing — the trusted place where the charter executes, the
shell runs, and existence is served.
