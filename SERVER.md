# The Nisc Application Server

> Working draft — the second foundation document, companion to
> [CHARTER.md](CHARTER.md). Nothing here is built. This document pins what the
> server is, why it must exist, what it is made of, and where it is deliberately
> unfinished. It is written to seed future sessions: it captures the design
> conversation, grounds every claim in what the code does today, and ends with
> the open questions.

**One sentence:** a lightweight runtime that serves *capabilities* instead of
code — a principal logs in, a charter resolves, and what arrives over the
socket is their application: the actions they may use, the data those actions
may touch, live, revocable, and identical in mechanism for humans and AI
agents.

Everything below is a consequence of that sentence.

---

## 1. The problem: the stack is server-shaped, and there is no server

This is not a vision looking for a justification. Six mechanisms, all designed,
all built or specified, all currently homeless:

1. **Actions are wire-ready and nothing wires them.** An `ActionDefinition` is
   pure serializable data — designed to live in a DB row, be validated at a
   boundary, be hot-registered (`shell.registerAction`). Relay imports them as
   TypeScript constants. The relay schema even has an `actions` table
   (JSONB definitions) — dead data, waiting.

2. **The charter has nowhere to execute.** [CHARTER.md](CHARTER.md) defines
   `resolve(charter, library) → catalog` per principal. Resolution must happen
   somewhere trusted. There is no trusted somewhere.

3. **Vex's multi-user machinery is built and dormant.** The express/hono
   adapters resolve scope per-request via a `getScope(req)` callback; `locked:
   true` turns an endpoint replay-only (fingerprints as query capabilities);
   the mutation grammar rejects `$scope` injection at parse; error codes
   `missing_scope` / `scope_denied` are already reserved. Relay hardcodes
   `usr_001`, leaves reads at `default: 'allow'`, and never locks. The
   enforcement floor exists; nothing stands on it.

4. **Server functions have no host.** The rule from the design discussion:
   *every functionality flows through an endpoint* — and fns are endpoints,
   named and server-deployed (`/fns/<name>`), so functionality ships without
   shipping frontend. Nothing registers or executes them server-side.

5. **The projection model is specified and unbuilt.** PRODUCTS_2.md:
   per-identity projections held in the DB, "written to the DB and pushed to
   connected clients at the same time," seeded on login with no AI call, held
   while the principal is offline. Called "ordinary engineering" in the doc.
   Nobody has done the ordinary engineering.

6. **There is no transport, anywhere.** Verified during research: signal's
   "wire/transport" layers are LLM-provider protocol handling (request-side
   transport resolution, response-side repair) — not network transport. No
   websocket, no session, no connection lifecycle exists in the monorepo.
   Nova's own DESIGN.md lists the wire protocol as explicit future work.

Six threads, one missing organ. Separately, every nisc app currently rebuilds
the same wiring — relay boots its own shell, hosts its own vex, registers its
own fns, stubs its own identity. The first external developer to touch the
stack forked relay to build a webhook visualizer *with access control* — proof
of demand and of fork-pressure in one artifact. App number three creates a
dialect. Spring Boot's historical contribution was ending exactly this era for
Java; that is the job here.

---

## 2. The inversion: what makes this server different in kind

A traditional application server hosts code and exposes endpoints. Everyone
receives the same application; authorization is a wall of checks around it.
This server inverts the relationship:

### 2.1 It serves existence

The unit served is the action — the complete behavioral contract (layout +
triggers + endpoints + input). A principal's resolved catalog **is their
application**. The warehouse kiosk granted two actions is not a locked-down
app; it is a two-action app. There is nothing else to render, invoke, or
attack. Deny-by-nonexistence (see CHARTER.md), made true by a server rather
than cosmetic in a client.

### 2.2 Deployment is a data operation

Publishing an action, a variant, a charter change, a server function — all are
writes to the artifact library, all propagate over the socket to exactly the
principals whose resolved catalogs changed. Consequences:

- **No version skew.** The shell and the definitions it runs live server-side;
  the client is a thin terminal that rarely changes. Reads (vex fingerprints)
  and writes (the closed mutation grammar) are capability-addressed through
  one discipline; fns are named endpoints that deploy with the server.
- **Rollback is a pointer move.** The library is versioned; "published" is a
  pointer per (artifact, tenant, channel).
- **The release artifact is a diff, not a build log.** The verifier renders
  publish-time consequences in concrete terms: *"crm.quotes → gained by:
  sales, sales-manager, intern, ray."* A human approves that.

### 2.3 One gate, every kind of principal

The resolved catalog feeds four consumers (CHARTER.md §Who consumes): the
human's shell, the agent's tool policy (cortex `policyGate` — allow/deny/risk
ceiling/approval already exist per tool call), the fn gate, and the
verifier.

The collapse is the point: user permissions, AI guardrails, feature flags,
and plan entitlements are **one document resolving to one set**, per
principal.

### 2.4 The shell runs on the server

Nova's core is headless and its interchange formats are already serializable:
`RenderNode[]` down, `NovaEvent` up. So the shell executes **server-side**,
and the client is a **canvas terminal**: primitive registry + RenderNode
differ + event pump. State is authoritative — the LiveView move, but
streaming semantic trees, so the terminal is tiny and swappable (React,
Svelte, native, TUI).

The cost is the round trip. Typing is the one interaction that cannot wait
for it, and two rules cover it: the terminal never overwrites the value of
the focused input when a new tree arrives (bound inputs are identified by
`model.path`), and `ui:model` events debounce. Both ship with the first
server binary.

Two things fall out of the same machinery:

- **Shared canvases.** N sockets attached to one canvas — multiplayer and
  ops-center are the same trees sent to every attached connection; events
  from any of them go to the same shell.
- **The client-execution degrade.** A canvas — or a whole app — may opt out
  and run its shell in the browser, with vex as the enforcement floor and
  client state unobserved. This is where offline, zero-backend PGlite, and
  the portable-file story from POSSIBILITIES.md live. It is an explicit
  opt-out, not a mode menu; one screen can still mix client-side chrome with
  authoritative server canvases. **Authority islands.**

(A shadow-shell posture — replaying the client's event stream into a headless
server twin to observe a client-executed canvas — was considered and cut: the
server shell makes it redundant, and it silently requires fully deterministic
layouts.)

The frame doesn't care: a `CanvasSlot` renders a tree and is indifferent to
whether it came from a local shell or a socket.

Design consequence, now the default session model: **the shell is durable,
the socket is ephemeral.** A server shell survives disconnect (PRODUCTS_2's
"the agent is at lunch"); the projection persists, the socket reattaches and
receives the current trees, work resumes. One lightweight supervised shell
per session —
BEAM/OTP-shaped thinking, even in Node.

### 2.5 The server verifies the application at boot

Because the entire application is closed, validated data — actions, charters,
schemas, fingerprints — the server can refuse to start incoherent: resolve
every role, run reachability closure per catalog (nav targets *and* message
channels — the audit machinery exists), check dead denies, orphan actions,
schema drift against fingerprints, and fn liveness — every fn endpoint a
published action references exists in the deployed registry.

Spring boots, then you discover the wiring was wrong at runtime. This refuses
to boot. **"If it boots, it's coherent"** is a headline feature, and it is
only possible because nothing here is code.

### 2.6 Derivation over configuration

Spring Boot's auto-configuration scanned the classpath — the presence of a jar
implied intent. Here the artifacts are richer than jars, so the server derives
itself:

- A Vex schema present → the data layer stands up: discovery, scoped queries,
  closed-grammar mutations, RLS, seeded fingerprints. The "one-liner
  repository" of Spring/JPA/Kotlin lore, except the one-liner is the entity
  schema itself.
- Action definitions present → catalog service, audit, agent affordances.
- A `fns/` folder present → the fn host stands up: named endpoints under
  `/fns`, gated by catalog closure.
- Agent definitions present → cortex host, tool policies from the same grants.
- Loom present → every schema in the system is *editable* — generated admin
  surfaces, including for charters and for the artifact library itself.

There is no configuration layer to learn because there is nothing to
configure that the artifacts don't already say.

---

## 3. The API: four surfaces, forever

A nisc app exposes exactly four things. There is no route table; **the catalog
is the API**, consumed three ways (rendered for humans, tool-called by agents,
invoked headlessly by systems).

1. **`/api/<resource>/vex`** — reads and writes. Locked (replay-only
   fingerprints), scoped per request. Already relay's shape today.
2. **`/fns/<name>`** — named server functions as endpoints
   (`/fns/deal-calculate-margin`). Invocable only within the calling
   principal's catalog closure (granted actions → their endpoints). The
   encouraged home for logic that isn't a vex read or write. The escape
   hatch — a conventional frontend folder of client fns, referenced by
   name — exists and is discouraged.
3. **`/catalog`** — the resolved catalog for the session's principal. In
   practice served and updated over the socket; the HTTP form exists for
   consumers without a socket.
4. **The socket** — the authority channel:
   - **catalog pushes** — grant changes, publishes, revocation, midflight
     (the resolved-set hash is the version token)
   - **projection sync** — write-to-DB-and-push; seed-on-login with no AI call
   - **fingerprint subscriptions** — live queries with capability discipline:
     a client may subscribe only to fingerprints it holds; the server pushes
     when underlying data changes
   - **canvas streams** — the primary channel: RenderNode trees down,
     NovaEvents up — nova's existing interchange, verbatim, over the socket
   - **streamed authoring** — a server-side agent composing an artifact
     streams it as always-valid partial JSON (solid), so the user watches the
     screen assemble

### The socket, specified

Decided 2026-07-15. No socket framework: raw WebSocket — `ws` on the server,
the platform `WebSocket` in terminals. The terminal contract is "open a
socket, exchange messages tagged with a canvas id" — implementable in any
language in an afternoon, which is what keeps the terminal swappable. We own
roughly 150 lines: reconnect with backoff, a liveness timer, parse and route.

**One connection per client, for everything.** Ten open canvases are ten
canvas ids on one pipe, never ten sockets. Two message shapes carry the
application:

```
→ { canvas, event }    // a NovaEvent, verbatim
← { canvas, render }   // the canvas's RenderNode tree, verbatim
```

- **Handshake.** Session token → find-or-rehydrate the session's shell →
  send every open canvas's current tree. The encoding is JSON with
  permessage-deflate on — compression cuts the trees 5–10×, and readable
  messages are the debugging story. No binary codec, no negotiation.
- **Routing.** Two maps: connection → session; canvas → attached
  connections. A shared canvas — ops-center, or the same person's phone and
  laptop — is a canvas whose connection set has more than one entry.
- **Backpressure.** At most one pending tree per canvas per connection; a
  newer render replaces it, never queues behind it. Structurally possible
  because the message is state, not history — a diff stream could never
  drop an update.
- **Delivery.** Events are fire-and-forget; the tree is the confirmation.
  No acks, no replay after reconnect — a replayed intention against a
  changed screen is worse than a lost one; the human acts again, as with
  any failed request.
- **Typing.** Three rules: the terminal never overwrites the value of the
  focused input (bound inputs are identified by `model.path`); `ui:model`
  events debounce; pending model values flush before any other event from
  the same canvas, so a fast submit never misses the last keystrokes.
- **Journal.** Every inbound NovaEvent is journaled before the shell
  handles it. "Show me exactly what the operator did" is a table, not a
  feature.
- **Durability.** The projection is the durable thing; the shell is a warm
  cache rebuilt from definitions + projection. Evicting an idle shell is
  safe; a process restart is safe — shells rehydrate on the next
  connection.
- **Scale-out, v1.** Sticky sessions pinned by session id; shared canvases
  require the participants' sessions on one node. Cross-node canvases are
  deferred, and cheap to defer: moving a session between nodes is
  eviction + rehydration, not state migration.

---

## 4. The component ledger

Honest accounting: what exists, what is assembly, what is new.

| Component | Job | Status |
|---|---|---|
| **Session adapter** | Auth is a session token, nothing else — no username/password. Magic link is the default login strategy. Token → principal → scope values; identity storage is explicitly *not ours to build* (PRODUCTS_2). | **New, small** |
| **Artifact library** | Actions, variants, charters, prisms in versioned storage; published pointers per (artifact, tenant, channel); history/replay/revert. | **New — table design; patterns are standard** (event-sourced versions + pointers; git works as the store for the single-tenant case) |
| **Catalog service** | Resolve charters per principal, hash, serve, diff, push on change. Runs the verifier. | **New — the one genuinely novel primitive** |
| **Vex host** | Mount the existing adapter; wire `getScope`; set `locked: true`; per-resource entity subgraphs. | **Exists, dormant — assembly** |
| **Fn host** | Register named server functions; serve them as endpoints under `/fns`; enforce catalog closure. | **New, small** |
| **Socket hub** | The socket as specified in §3: one connection, canvas-tagged messages, routing, backpressure, journal. Raw `ws` plus ~150 owned lines (reconnect, liveness, parse/route). | **New, small** |
| **Cortex host** | Server-side agents as principals; `ToolPolicy` derived from resolved catalogs; risk ceilings and approval gates already exist. | **Exists — assembly** |
| **Verifier** | Boot/CI coherence; charter lints (dead deny = error, re-allow flags, orphans, assertions); closure reports; publish diffs. | **New — per CHARTER.md, half the product** |

Supporting facts from research, for the next session's benefit:

- `shell.push` of an unregistered id throws `UnknownActionError` — the natural
  client-side chokepoint already exists. Nova needs two small seams: an
  optional resolve/guard hook (step 2) and `removeAction` (lands with the
  relay proof, step 1: removes the definition and unmounts live instances).
- `composeAction` is additive-only (the action wins on conflict) — role
  shaping therefore happens at **catalog build time on the server** (variants
  as distinct ids, per CHARTER.md), never at push-time composition.
- Message triggers deliver no payload (verified in nova source) — a fact that
  shaped the devtools and will shape the socket protocol: notify-then-pull is
  the native pattern.
- Cortex gates chain policy → agent gates → run gates, keyed on canonical tool
  ids; `riskLevel` is first-class. The agent side of "one gate" is built.

---

## 5. The working set (naming unsettled: "horizon"?)

For large apps — and for AI context budgets — the catalog itself streams.

The insight: the audit machinery already computes an **action adjacency
graph** (nav targets, channels). A principal's *projection* is everything they
are granted; their **working set** is what's resident right now — the graph
neighborhood of their active actions. Serve radius-1 immediately, prefetch
radius-2 on drill, fault the rest in on demand. Level-streaming, computed from
reachability rather than authored. Manual grouping (a seed set per seat)
covers cold start.

The same mechanism bounds the agent: the working set partitions `findAction`
retrieval and caps context assembly. **Level streaming for humans is context
management for models** — one mechanism, two products.

---

## 6. What this server refuses to be

| Temptation | Refusal |
|---|---|
| An auth provider | BYO identity. The server consumes a session, never mints one. |
| A framework | It is an assembly point. The intelligence lives in the artifacts; the server resolves, serves, pushes, enforces. Component count stays single-digit. |
| Heavy | The name (unsettled) must carry this: as lightweight as they come. If it stops being embarrassing how small it is, something went wrong. |
| A place where policy hides | Every opinion it enforces is a readable artifact: charter, scope policy, assertion. No annotations, no proxies, no interceptor magic. The AOP analog is a query over definitions applying a fragment — visible in devtools, not woven in bytecode. |
| A second way to do anything | Reads are vex, writes are vex, compute is fns, UI is actions, permissions are the charter. The server adds no new vocabulary of its own. |

## 7. Comparisons, for orientation

- **Spring Boot / NestJS** — borrowed: zero-conf, embedded server, opinionated
  composition, the "starter" experience. Inverted: their guards protect routes
  that exist for everyone; this serves per-principal existence. Their
  deployment unit is a build artifact; this one's is a row.
- **Phoenix LiveView** — the closest spiritual relative. LiveView holds the
  DOM; this holds the *definition* and streams semantic trees, keeping the
  client swappable. And the client-execution degrade exists on the same
  artifacts — LiveView has no client-authoritative posture.
- **Firebase / Hasura** — declarative rules, but they stop at the data layer.
  The unit here is the behavioral capability including its UI. (Vex alone is
  the Hasura comparison; the server is what Hasura never had above it.)
- **Retool and internal-tool builders** — PRODUCTS.md covers this: those are
  code-based builders; this is description-based with validated, cached,
  ACL'd artifacts.
- **HATEOAS** — the forty-year-old constraint ("the server tells you your
  affordances") finally with typed, composable, auditable affordances.

## 8. Relay is the proof, and the metric

Relay already demonstrates the application model: declarative actions,
vex-backed data through prism seams, an in-app agent, and devtools *built of
nova itself* — with laughably little imperative JavaScript. It is the
Petclinic of this server.

**The KPI: relay's `src/` shrinks with every server release.** Each extraction
(projection client, socket boot, fn host, identity stub → session adapter)
moves wiring out of the app. The server is done when relay is: a schema, a
folder of actions, prism seams, a primitive registry, and one boot file — and
when `create-nisc-app` gives the webhook-visualizer developer login → catalog
→ live data → devtools → a gated agent, from a schema and a folder of actions.

Staging (each step shippable):

1. **Prove the charter in relay, client-side** — sign-in (username → fake
   magic link → token), roles, catalog filtering at shell construction,
   read-RLS rules turned on, `locked: true`, the closure report in a
   charter check script; nova gains `removeAction`. No server yet;
   validates the model end to end.
   Concrete plan: [apps/lab/relay/IMPLEMENTATION.md](apps/lab/relay/IMPLEMENTATION.md).
2. **Extract the policy engine** (charter resolution + verifier) as its own
   library; nova grows its guard hook (`removeAction` already landed in
   step 1).
3. **First server binary** — hono + session adapter + vex host (scoped,
   locked) + `/catalog` + the socket as specified in §3; the shell runs
   server-side and relay's client becomes a canvas terminal.
4. **Projections + fn host** — durable sessions, seed-on-login,
   write-and-push; named fns under `/fns`; relay's `functions:` map migrates
   to fn endpoints (what stays client-side moves to the escape-hatch folder,
   and shrinks). Ray returns here: its tool policy derived from the same
   grants — one JSON document narrowing both the human's sidebar and the
   agent's tools.
5. **Shared canvases and working-set streaming** — and the client-execution
   degrade formalized behind the same canvas contract.
6. **Then, and only then, name it** — after showroom, relay, and at least one
   external app run on it, it will have earned whatever it's called.

## 9. Settled

Decided in review (2026-07-15):

- **The server shell is the architecture, not a mode.** Client execution is
  an explicit per-canvas (or per-app) degrade for offline/zero-backend; the
  shadow shell is cut; shared canvases are fan-out of the same stream. The
  mode taxonomy is gone.
- **Server functions are endpoints** — named, under `/fns/<name>`, gated by
  catalog closure. No hashes, no manifests. The frontend escape-hatch folder
  is a convention and discouraged.
- **Raw WebSocket, no framework.** One connection per client; every message
  carries its canvas id. JSON with permessage-deflate — no binary codec, no
  encoding negotiation; protobuf refused (open-shaped trees don't protobuf).
  The terminal contract stays implementable in any language in an afternoon.
- **The socket invents nothing.** It carries nova's existing interchange —
  NovaEvents up, whole RenderNode trees down; reconnect re-sends the current
  trees, so there is no replay or versioning machinery. Diffing is a later
  optimization inside the render message, only if measured tree size ever
  demands it. Typing is three rules: the terminal never overwrites the
  focused input, `ui:model` events debounce, and pending model values flush
  before any other event from the same canvas.
- **Auth is a token.** The server consumes a session token and nothing else;
  no username/password. Magic link login is the default strategy.

## 10. Open questions

Argue here. These are the ones that shape everything downstream.

1. **The artifact library schema.** Versioned rows + published pointers is
   settled in spirit ("it's a database table"); the real decisions are
   tenancy overlays, draft/published channels, and whether charters version
   in lockstep with the actions they select.
2. **Session ↔ shell lifecycle.** When does an idle shell get evicted, and
   what does logout unmount? Multi-device is answered — two connections
   attached to the same canvases.
3. **Working-set mechanics.** Radius heuristics vs authored seeds; what the
   client caches across sessions; how revocation interacts with prefetched
   definitions.
4. **The name.** Shelved, not forgotten. Constraint discovered along the way:
   it must sound as light as the thing is (skiff / pith energy — the heavy
   names all overstated it; "wick" vetoed for the John Wick collision).
