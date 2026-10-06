# @niscorp/moss

The nisc application server. A principal logs in, a charter resolves, and what arrives over the socket **is their application** — the actions they may use, the data those actions may touch — derived from authored artifacts, live and revocable, identical in mechanism for humans and AI agents.

Moss does not host code and guard it. It serves *existence*: a resolved catalog **is** the application. The warehouse kiosk granted two actions is not a locked-down app; it is a two-action app. There is nothing else to render, invoke, or attack.

> On npm, and still early. The data/policy plane, the socket, per-principal server shells, ring-2 served layout variants, the in-process function seam, server-drawn documents and pages, and the canvas terminal (the wire plus swappable render targets) are built and tested — except the ink render target, which has no tests yet. The fn *host* (`/fns`), the artifact library, the projection model, and scale-out are specified and pending. See [DESIGN.md](DESIGN.md) for the thesis and the unbuilt ladder.

## Install

```bash
pnpm add @niscorp/moss @niscorp/charter @niscorp/nova @niscorp/prism @niscorp/strata @niscorp/tide @niscorp/vex zod
# the nisc packages moss composes and zod are required peers — the app owns
# the one copy of each. hono, the Node listener and ws come with moss as
# regular dependencies. The optional peers, each needed by one subpath only:
pnpm add react react-dom   # ./terminal/react (and its /server)
pnpm add vue               # ./terminal/vue (and its /server)
pnpm add ink react         # ./terminal/ink
pnpm add -D vite           # ./vite
```

Node ≥ 22.12.

## The shape

An app hands moss its **artifacts** (`defineApp`) and an **environment** (`NiscRuntime` — a database and how a session token is verified, optionally a cache). Everything mechanical is derived: the data layer from the schema, per-principal policy and catalogs from the charter, the server shells from the manifest. The server refuses to boot on an incoherent charter.

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
  behaviors,      // row-level scope semantics; each role's `scoping` picks among them,
                  // one policy per role, merged — a person may hold several
  resources,      // entity subgraphs → /api/<name>/vex
  shell,          // the canvas manifest (the shell runs on the server) — the app
  pages,          // what is drawn at a path and kept by nothing — optional
  functions,      // the in-process fn seam (agents, sign-in) — optional
});

const server = await serve(app, { pool, db, session: 'sessions', port: 3000 });
// `session` is required: 'sessions' (moss's stored credential), 'dev-open'
// (every well-formed token trusted — harnesses), or the app's own verifier.
// boot refusal here (createServer runs inside serve); HTTP + ws in one
```

The charter defines a role named `public`. It is what a request with no session
resolves to, and a signed-in principal with no assignment. `public: []` grants
nothing. A charter without the role still boots, and those requests then fail
with `Unknown role "public"`.

## The first screen can arrive with the page

A page request can be answered with the screen itself: the caller's shell is
read as it stands (`shells.snapshot`), drawn to a string by the app's own kit
(`terminal/react/server`, `/vue/server`, `/dom/server`), and written into the
app's `index.html` beside the snapshot it was drawn from. The browser's terminal
starts from that snapshot and adopts the elements already there — a first frame
delivered early, with the socket still the authority.

```typescript
import { renderDocument } from '@niscorp/moss';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';

server.get('*', async (c) => {
  const page = await renderDocument({
    server,
    template: indexHtml,
    request: { path: c.req.path, cookie: c.req.header('cookie') },
    draw: (snapshot) => renderSnapshot({ snapshot, registry, slotWrapper }),
  });
  return c.html(page.html, 200, page.headers);
});
```

```typescript
// the browser's entry
const drawn = readDocumentSnapshot();
createWire({ env: browserEnv(), ...(drawn ? { initial: drawn } : {}) });
```

Who may keep the page follows from who asked: drawn for nobody it is the same
for everybody; drawn for somebody it is `private, no-store`. A page that cannot
be drawn goes out undrawn.

The page's `<head>` is a node in a layout too — nova's `nova:head`, holding
the elements a head holds, bound to the action's data. It is read off the
snapshot and written into the template, and the terminal keeps the page's head
on it as the screen moves. With `site`, every path says its own canonical
address.

`pages` are the other thing a path can lead to: a shell manifest drawn for
whoever asks and then let go — a welcome, the docs. A page with nothing left to
happen opens no socket, and `exportDocuments` writes pages as files. See
[DOCS.md § The document](DOCS.md#the-document) and
[DESIGN.md § Pages](DESIGN.md#pages).

## The client is a terminal — any terminal

moss serves the application: per-principal trees down the socket, events
up. What paints them is a **render target**, and targets are interchangeable
over one wire:

- **`terminal/react`** — the browser, with the app's styled component kit
- **`terminal/vue`** — the same, for an app whose kit is Vue
- **`terminal/dom`** — the browser, zero framework, nova's reference kit
- **`terminal/tty`** — a REPL in a real terminal: frames print as text,
  numbers act (`6` clicks, words fill the input)
- **`terminal/ink`** — a full-screen TUI: same numbers, live focus, color

One wire, one session, one server. Sign in from the REPL and the TUI is
already signed in — the token file is the terminal's localStorage. The
server never learns which target rendered the frame; policy, layouts, and
data are decided per principal, never per client.

```
── main ────────────────────────────────
Sign in to Relay
[1] ⟨alex, jordan or sam⟩
[2] (Send magic link)
› alex
› 2
Magic link sent to alex@relay.app. The email is faked — the link is right here:
[1] (Open magic link)
```

Under the hood: `./client` is the wire (a plain-TS protocol client: token
slot, reconnect, session lifecycle — host-shaped pieces injected as a
`WireEnv`, browser by default, `./client/node` for a plain process);
`./terminal` is the conductor and the hot-swap switcher; targets close over
their own surface (a DOM root, a stdio pair), so the contract is
surface-blind. Framework-shaped code lives only in the target subpaths,
never in moss core.

## Subpaths

- **`@niscorp/moss`** — the server: `defineApp`, `createServer`, the resolution and shell-host internals, the socket protocol types.
- **`@niscorp/moss/node`** — the Node listener: `serve` + `attachSocket` (raw `ws`), and `mountSite(server, { dist, draw })` — the built terminal served by the same process, every page drawn. Bun swaps this file, never the app.
- **`@niscorp/moss/vite`** — `mossDev({ app })`: the app server inside vite's dev process — loaded through vite (an edit re-boots it), the socket attached once, pages drawn, moss's paths answered, a dev-only `/dev/as/<who>`. `nisc dev` adds it for an app behind moss; `vite` is an optional peer.
- **`@niscorp/moss/client`** — the wire: `createWire()`, the app end of the socket. Plain TypeScript, zero React, zero globals — the host comes in as a `WireEnv` (default: `browserEnv()`, localStorage + location).
- **`@niscorp/moss/client/node`** — the Node host env: `nodeEnv({ url, tokenFile? })` runs the same wire on a plain Node (or Bun) process — token in a file, the runtime's WHATWG WebSocket.
- **`@niscorp/moss/terminal`** — the terminal: `createTerminal` (one target, one wire) and `mountTerminal` (hot-swaps render targets on a hotkey over one wire; the session survives the swap). Framework-blind, surface-blind.
- **`@niscorp/moss/terminal/react`** — the React render target: `reactTarget({ root, registry, slotWrapper? })` binds the app's component registry to the wire via nova's React adapter.
- **`@niscorp/moss/terminal/vue`** — the Vue render target: `vueTarget({ root, registry, slotWrapper? })` binds the app's Vue component registry to the wire via nova's Vue adapter; updates re-render reactively, never remount.
- **`@niscorp/moss/terminal/dom`** — the plain-DOM render target: `domTarget({ root })` renders with nova's DOM adapter and default kit. Zero framework.
- **`@niscorp/moss/terminal/react/server`**, **`/vue/server`**, **`/dom/server`** — `renderSnapshot(...)`: a shell snapshot drawn to a string by the same kit, for `renderDocument`'s `draw`.
- **`@niscorp/moss/terminal/tty`** — the line-terminal render target: `ttyTarget({ input, output })` runs the app as a REPL in a real terminal — served frames print as text with numbered markers, typing acts on them (numbers tap, words fill), and the same events ride the wire. Zero framework, zero DOM.
- **`@niscorp/moss/terminal/ink`** — the full-screen terminal render target: `inkTarget()` runs the app as a TUI — nova's Ink kit on the React adapter's walker. Same `[n]` addressing as the REPL (typed digits click/flip/focus), plus Tab/arrows and live typing. ESM-only, like ink.

## What it serves

- **`/catalog`** — the application, resolved for you (granted action ids + a version token).
- **`/api/vex`, `/api/<resource>/vex`** — reads and writes, locked (replay-only), scoped per principal. The model never writes SQL; the policy it can't see enforces access.
- **the socket** — the authority channel: the served frame and per-canvas `RenderNode` trees down, `NovaEvent`s up (a message a terminal sends is at most 256 KB). Session lifecycle (sign-in grant, sign-out revoke) rides it. Two optional reductions sit under it, both invisible to an app: `permessage-deflate` (on by default) and frame deltas (`shellFrameDelta`, off) — a changed canvas sent as a checksummed delta against the frame the terminal already holds, 1–4% of the frame on an in-place change. See [DOCS.md § Wire size](DOCS.md#wire-size).

## Tables and documents, versioned

moss creates no table on its own: its tables (`MOSS_SEQUENCE`, plus
`SESSIONS_SEQUENCE` when the runtime's `session` is `'sessions'`) and the vex
cache's go through one [strata](../strata/README.md) ledger run at boot — once,
recorded, refused if the ledger was edited or written by newer code. The tide
store's tables (`TIDE_SEQUENCE`) go through the same ledger when
`createTideStore(pool)` is called. `migrations: 'verify'` on the
runtime refuses to boot with anything pending. Stored integration actions carry
a grammar stamp and are upgraded at boot, at intake and on read — through
nova's and Prism's grammars plus the app's own (`NiscApp.grammars`); a bundle or
row written by newer grammars is refused. See [DOCS.md](DOCS.md).

See [DESIGN.md](DESIGN.md) for the inversion and [DOCS.md](DOCS.md) for the full API.
