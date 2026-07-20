# @niscorp/moss

The nisc application server. A principal logs in, a charter resolves, and what arrives over the socket **is their application** — the actions they may use, the data those actions may touch — derived from authored artifacts, live and revocable, identical in mechanism for humans and AI agents.

Moss does not host code and guard it. It serves *existence*: a resolved catalog **is** the application. The warehouse kiosk granted two actions is not a locked-down app; it is a two-action app. There is nothing else to render, invoke, or attack.

> Early stages. The data/policy plane, the socket, per-principal server shells, ring-2 served layout variants, the in-process function seam, and the canvas terminal (the wire plus swappable render targets) are built and tested — except the terminal's render targets, which have no tests yet. The fn *host* (`/fns`), the artifact library, the projection model, and scale-out are specified and pending. See [DESIGN.md](DESIGN.md) for the thesis and the unbuilt ladder.

## Install

```bash
pnpm add @niscorp/moss
# everything moss composes (charter, vex, nova, prism, hono, the Node
# listener) comes with it as regular dependencies. The one optional peer
# pair is React, needed only for the ./terminal/react render target:
pnpm add react react-dom
```

## The shape

An app hands moss its **artifacts** (`defineApp`) and an **environment** (`NiscRuntime` — a database, optionally a cache and a session verifier). Everything mechanical is derived: the data layer from the schema, per-principal policy and catalogs from the charter, the server shells from the manifest. The server refuses to boot on an incoherent charter.

```typescript
import { defineApp } from '@niscorp/moss';
import { serve } from '@niscorp/moss/node';

const app = defineApp({
  charter,        // the policy document (resolved per principal)
  assignments,    // principal → roles
  actions,        // the ActionDefinitions the app ships
  layouts,        // ring 2: layout variants by minted id — { action, layout },
                  // substituted per principal at shell build. The base is the
                  // floor; variants enrich upward as grants, never reduce
  entries,        // the prewarmed vex cache — the API surface, as data
  behaviors,      // row-level scope semantics the charter can't express
  resources,      // entity subgraphs → /api/<name>/vex
  shell,          // the canvas manifest (the shell runs on the server)
  functions,      // the in-process fn seam (agents, sign-in) — optional
});

const server = await serve(app, { pool, db, port: 3000 });
// boot refusal here (createServer runs inside serve); HTTP + ws in one
```

The client is a **canvas terminal**, and moss ships it: `./client` is the wire (a plain-TS protocol client: token slot, reconnect, session lifecycle), `./terminal` is the conductor and the hot-swap switcher, and `./terminal/react` / `./terminal/dom` are render targets — nova's React adapter (`@niscorp/nova/adapters/react`) with the app's registry, or nova's DOM adapter with its default kit, zero config. Framework-shaped code lives only in the target subpaths, never in moss core.

## Subpaths

- **`@niscorp/moss`** — the server: `defineApp`, `createServer`, the resolution and shell-host internals, the socket protocol types.
- **`@niscorp/moss/node`** — the Node listener: `serve` + `attachSocket` (raw `ws`). Bun swaps this file, never the app.
- **`@niscorp/moss/client`** — the wire: `createWire()`, the browser end of the socket. Plain TypeScript, zero React.
- **`@niscorp/moss/terminal`** — the terminal: `createTerminal` (one target, one wire) and `mountTerminal` (hot-swaps render targets on a hotkey over one wire; the session survives the swap). Framework-blind.
- **`@niscorp/moss/terminal/react`** — the React render target: `reactTarget({ registry, slotWrapper? })` binds the app's component registry to the wire via nova's React adapter.
- **`@niscorp/moss/terminal/dom`** — the plain-DOM render target: `domTarget()` renders with nova's DOM adapter and default kit. Zero framework, zero config.

## What it serves

- **`/catalog`** — the application, resolved for you (granted action ids + a version token).
- **`/api/vex`, `/api/<resource>/vex`** — reads and writes, locked (replay-only), scoped per principal. The model never writes SQL; the policy it can't see enforces access.
- **the socket** — the authority channel: the served frame and per-canvas `RenderNode` trees down, `NovaEvent`s up. Session lifecycle (sign-in grant, sign-out revoke) rides it.

See [DESIGN.md](DESIGN.md) for the inversion and [DOCS.md](DOCS.md) for the full API.
