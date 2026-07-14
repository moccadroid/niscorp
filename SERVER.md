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
   *every functionality flows through an endpoint; fns should be server
   functions, so functionality deploys without deploying frontend, gated
   against a hash.* Nothing registers, hashes, or executes them server-side.

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

- **No version skew.** Definitions pin the fn hashes they were authored
  against (`fn:enrichCompany@sha256:…`). Old clients call the old hash until
  their catalog refreshes. Reads (vex fingerprints), writes (the closed
  mutation grammar), and compute (fn hashes) are all capability-addressed
  through one discipline.
- **Rollback is a pointer move.** The library is versioned; "published" is a
  pointer per (artifact, tenant, channel).
- **The release artifact is a diff, not a build log.** The verifier renders
  publish-time consequences in concrete terms: *"crm.quotes → gained by:
  sales, sales-manager, intern, ray."* A human approves that.

### 2.3 One gate, every kind of principal

The resolved catalog feeds five consumers (CHARTER.md §Who consumes): the
human's shell, the agent's tool policy (cortex `policyGate` — allow/deny/risk
ceiling/approval already exist per tool call), the fn-closure allowlist, the
verifier, and — because a catalog of typed, input-schema'd actions *is* a tool
listing — **an MCP server, for free**. Every nisc app is automatically an MCP
server with real access control. Ray's own catalog module anticipated this
verbatim: *"Future: this loads from a DB/API — MCP-for-actions; the read
surface is already the seam."*

The collapse is the point: user permissions, AI guardrails, feature flags,
plan entitlements, and external integration surface are **one document
resolving to one set**, per principal.

### 2.4 Authority is a dial, not an architecture

Nova's core is headless and its interchange formats are already serializable:
`RenderNode[]` down, `NovaEvent` up. So *where a shell executes* is a
deployment choice — and the right unit of choice is the **canvas**, not the
app:

| Mode | Shape | What it buys | Cost |
|---|---|---|---|
| **0 — client shell** | Definitions served; shell runs in browser; vex is the backstop | Cheap, offline-capable (PGlite keeps the zero-backend story from POSSIBILITIES.md alive) | Client state is unobserved |
| **1 — shadow shell** | Client shell + server replays the same event stream into a headless twin per session | The server knows every screen's state without streaming anything; divergence = tamper alarm; "show me exactly what the operator's screen said when they clicked approve" | Double execution (events are tiny) |
| **2 — server shell** | Shell runs server-side; client is a *canvas terminal*: primitive registry + RenderNode differ + event pump | Authoritative state; the LiveView move but streaming semantic trees, so the terminal is tiny and swappable (React, Svelte, native, TUI) | Round-trip latency — needs local echo for `ui:model` (game-netcode-style prediction + reconciliation, declared in the tree) |
| **3 — shared server canvas** | Mode 2 with N sockets attached to one canvas stream | Multiplayer/ops-center for free — fan-out of the same diffs | Same as 2 |

The frame doesn't care: a `CanvasSlot` renders a tree and is indifferent to
whether it came from a local shell or a socket. One screen can mix modes —
client-side chrome, an authoritative refund canvas, a shared incident canvas.
**Authority islands.**

Design consequence to fix early: **the shell is durable, the socket is
ephemeral.** A server shell survives disconnect (PRODUCTS_2's "the agent is at
lunch"); the projection persists, the socket reattaches, work resumes. One
lightweight supervised shell per session — BEAM/OTP-shaped thinking, even in
Node.

### 2.5 The server verifies the application at boot

Because the entire application is closed, validated data — actions, charters,
schemas, fingerprints, fn manifests — the server can refuse to start
incoherent: resolve every role, run reachability closure per catalog (nav
targets *and* message channels — the audit machinery exists), check dead
denies, orphan actions, schema drift against fingerprints, fn-hash liveness.

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
2. **`/fn`** — hash-addressed server functions. Executable only within the
   calling principal's catalog closure (granted actions → their endpoints →
   their fn hashes). Fns declare what they touch in a server-side manifest;
   the declaration is reviewed code, not client claims.
3. **`/catalog`** — the resolved catalog for the session's principal. In
   practice served and updated over the socket; the HTTP form exists for
   headless/MCP consumers.
4. **The socket** — the authority channel:
   - **catalog pushes** — grant changes, publishes, revocation, midflight
     (the resolved-set hash is the version token)
   - **projection sync** — write-to-DB-and-push; seed-on-login with no AI call
   - **fingerprint subscriptions** — live queries with capability discipline:
     a client may subscribe only to fingerprints it holds; the server pushes
     when underlying data changes
   - **canvas streams** — modes 2/3: RenderNode diffs down, events up
   - **streamed authoring** — a server-side agent composing an artifact
     streams it as always-valid partial JSON (solid), so the user watches the
     screen assemble

---

## 4. The component ledger

Honest accounting: what exists, what is assembly, what is new.

| Component | Job | Status |
|---|---|---|
| **Session adapter** | BYO auth. Token → principal → scope values. Identity/session/role storage is explicitly *not ours to build* (PRODUCTS_2); the contract is. | **New, small** |
| **Artifact library** | Actions, variants, charters, prisms, fn manifests in versioned storage; published pointers per (artifact, tenant, channel); history/replay/revert. | **New — table design; patterns are standard** (event-sourced versions + pointers; git works as the store for the single-tenant case) |
| **Catalog service** | Resolve charters per principal, hash, serve, diff, push on change. Runs the verifier. | **New — the one genuinely novel primitive** |
| **Vex host** | Mount the existing adapter; wire `getScope`; set `locked: true`; per-resource entity subgraphs. | **Exists, dormant — assembly** |
| **Fn host** | Register/hash/execute server functions; enforce catalog closure; manifest of touched entities. | **New, small** |
| **Socket hub** | Everything in §3.4. Durable sessions, ephemeral connections, resume tokens. | **New — the real transport work; nothing exists** |
| **Cortex host** | Server-side agents as principals; `ToolPolicy` derived from resolved catalogs; risk ceilings and approval gates already exist. | **Exists — assembly** |
| **Verifier** | Boot/CI coherence; charter lints (dead deny = error, re-allow flags, orphans, assertions); closure reports; publish diffs. | **New — per CHARTER.md, half the product** |

Supporting facts from research, for the next session's benefit:

- `shell.push` of an unregistered id throws `UnknownActionError` — the natural
  client-side chokepoint already exists. Nova needs two small seams: an
  optional resolve/guard hook and `removeAction` (the actions map is add-only
  today; revocation needs the verb plus an unmount policy for live instances).
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
| A place where policy hides | Every opinion it enforces is a readable artifact: charter, scope policy, fn manifest, assertion. No annotations, no proxies, no interceptor magic. The AOP analog is a query over definitions applying a fragment — visible in devtools, not woven in bytecode. |
| A second way to do anything | Reads are vex, writes are vex, compute is fns, UI is actions, permissions are the charter. The server adds no new vocabulary of its own. |

## 7. Comparisons, for orientation

- **Spring Boot / NestJS** — borrowed: zero-conf, embedded server, opinionated
  composition, the "starter" experience. Inverted: their guards protect routes
  that exist for everyone; this serves per-principal existence. Their
  deployment unit is a build artifact; this one's is a row.
- **Phoenix LiveView** — closest spiritual relative for mode 2. LiveView holds
  the DOM; this holds the *definition* and streams semantic trees, keeping the
  client swappable. And modes 0/1 exist on the same artifacts — LiveView has
  no client-authoritative posture.
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

1. **Prove the charter in relay, client-side** — fake login, three roles,
   catalog filtering at shell construction, read-RLS rules turned on,
   `locked: true`, a "principal" tab in the devtools dock showing grants and
   the closure report. No server yet; validates the model end to end.
2. **Extract the policy engine** (charter resolution + verifier) as its own
   library; nova grows its two seams (guard hook, `removeAction`); Ray's tool
   policy derived from the same grants — the demo where one JSON document
   narrows both the human's sidebar and the agent's tools.
3. **First server binary** — hono + vex adapter (scoped, locked) + `/catalog`
   + session adapter + minimal socket (catalog push only). Client mode 0.
4. **Projections + fn host** — durable sessions, seed-on-login,
   write-and-push, hash-addressed fns. Relay's `functions:` map moves
   server-side.
5. **Authority modes** — shadow shell (1), then server canvases (2/3) behind
   the same canvas contract. MCP surface. Working-set streaming.
6. **Then, and only then, name it** — after showroom, relay, and at least one
   external app run on it, it will have earned whatever it's called.

## 9. Open questions

Argue here. These are the ones that shape everything downstream.

1. **The socket protocol.** The real contract of the server: event log up /
   tree-and-catalog diffs down, resume tokens, where optimistic echo is
   allowed, how fingerprint subscriptions batch. Notify-then-pull vs push —
   nova's own message-trigger design suggests notify-then-pull as the native
   idiom. This deserves its own document before any code.
2. **Default authority mode.** Is mode 0 (client shell) the default with
   mode 2 opt-in per canvas, or does the server-shell become the default once
   it exists? Bears on offline, on PGlite's role, and on how POSSIBILITIES.md
   §1 (the app as a portable file) coexists with the server story.
3. **The artifact library schema.** Versioned rows + published pointers is
   settled in spirit ("it's a database table"); the real decisions are
   tenancy overlays, draft/published channels, and whether charters version
   in lockstep with the actions they select.
4. **Session ↔ shell lifecycle.** One durable shell per session: eviction,
   reconnect semantics, multi-device (two sockets, one projection?), and what
   "logout" unmounts.
5. **The fn manifest.** Shape of the declaration (touched entities, risk
   level?), and whether fn hashes version independently of the actions
   pinning them.
6. **Working-set mechanics.** Radius heuristics vs authored seeds; what the
   client caches across sessions; how revocation interacts with prefetched
   definitions.
7. **The name.** Shelved, not forgotten. Constraint discovered along the way:
   it must sound as light as the thing is (wick / skiff / pith energy — the
   heavy names all overstated it).
