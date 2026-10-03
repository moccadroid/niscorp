# @niscorp/cli

`nisc` — the command for a nisc application.

```bash
pnpm add -D @niscorp/cli
```

A new app starts with `npm create nisc`, which writes the `nisc.config.ts`
described below.

```bash
nisc dev       # the app's dev server
nisc build     # bundle the app, draw every path, and check what was drawn
nisc export    # build, then write every path as a file — the site as a folder
nisc start     # serve the built app, each path's first screen drawn
nisc check     # the app's check suite
```

An app is one of two things, and the command runs both. **Behind moss**, the
shell lives on the server and the page is a terminal. **With its own shell**,
the shell lives in the page and there is no server at all. Either way the first
thing a browser — or a crawler — receives for a path is that path's screen, as
markup.

## What an app writes

One file at its root, `nisc.config.ts`, exporting `project` — what only the app
knows. Which of the two it is follows from what it hands over.

### An app behind moss

```typescript
import type { NiscMossProject } from '@niscorp/cli';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';
import { boot } from './src/server/boot';
import { buildRegistry } from './src/ui/registry';

const registry = buildRegistry();

export const project: NiscMossProject = {
  // how it stands up — the same boot its dev server and its checks run
  boot: async () => {
    const { server } = await boot();
    return { server, close: () => server.close() };
  },
  // how one of its screens is drawn to a string
  draw: (snapshot) => renderSnapshot({ snapshot, registry }),
};
```

Everything else is read off the booted app: which paths exist (`/`, and every
page in the manifest), and what each one needs once it has been drawn.

| Field | |
|---|---|
| `boot` | stand the app up: `{ server, close? }` |
| `draw` | a terminal that draws a screen to a string (moss's `terminal/react/server`, `/vue/server`, `/dom/server`) |
| `htmlAttributes?` | what the kit would put on `<html>` from an effect (a palette, a scheme) |
| `paths?` | the paths to build. Default: `/` and every page whose path has no parameter. A page like `/docs/:slug` has as many paths as there are rows — list them here (`server.executeAs` runs a seeded read as a charter role) |
| `routes?` | routes of the app's own that `nisc start` registers before the site (a sign-in handoff, a webhook) |
| `dist?` | where the bundler writes the terminal (default `dist`) |
| `stylesheet?` | where the built page's stylesheet goes: `'page'` (the default — written into `index.html`, see `nisc build`) or `'file'` (left as the bundler linked it) |
| `checks?` | the check suite `nisc check` runs (default `src/dev/all-checks.ts`) |
| `tokenKey?` | the wire's token key, when it is not `nisc.token` |
| `dev?` | what only `nisc dev` uses: `dev.signIn(server, who)` mints a token for `/dev/as/<who>` (`null`: nobody of that name) |

### An app with its own shell

No moss, and none installed. The config hands over the app's own boot — **the
same one its browser entry runs** — and the two ends of a drawn screen:

```typescript
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { NiscShellProject } from '@niscorp/cli';
import { boot } from './src/boot';
import { Screen, adopt } from './src/ui/screen';

export const project: NiscShellProject = {
  // one fresh shell per call, for one path — and nothing else is handed in
  shell: async ({ path }) => {
    const app = await boot();
    return { shell: app.shell, close: () => app.db.close() };
  },
  // draw it to markup, where there is no browser
  draw: (shell) => renderToString(createElement(Screen, { shell })),
  // pick the markup up — the call the browser entry makes (hydrateRoot)
  adopt,
};
```

The browser entry does the same two things in the page — boot, then adopt:

```tsx
const app = await getApp();
if (root.hasChildNodes()) {
  await shellSettled(app.shell);      // reach the screen the file holds
  adopt(root, app.shell);             // hydrateRoot(root, <Screen shell={shell} />)
} else {
  createRoot(root).render(<Screen shell={app.shell} />);   // dev: nothing was drawn
}
```

`draw` and `adopt` are the adapter's: `react-dom/server` + `hydrateRoot`,
`vue/server-renderer` + `createSSRApp().mount`, or — no framework in the page
at all — nova's DOM adapter, `renderToString` from
`@niscorp/nova/adapters/dom/server` + `mountShell`.

| Field | |
|---|---|
| `shell` | one fresh copy of the app's shell for `{ path }`: `{ shell, close? }`. Called several times per path — it must not memoize |
| `draw` | the shell, drawn to a string |
| `adopt` | `(root, shell)` — the page picking the markup up |
| `htmlAttributes?` | what the kit would put on `<html>` from an effect |
| `paths?` | the paths to build (default `/`) — an app that maps paths to actions lists its own |
| `waitMs?` | how long a build waits for a screen to be whole (default 5000) |
| `dist?`, `stylesheet?`, `checks?` | as above |

The built `index.html` must hold the empty root, `<div id="root"></div>` — that
is where a screen goes. The adoption check needs a DOM: `jsdom`, installed in
the app.

The config is TypeScript, loaded with the app's own `tsconfig.json` — path
aliases included. `nisc.config.mts`, `.js` and `.mjs` are found too. A config
that hands over both `boot` and `shell` has not said which it is, and is
refused.

## `nisc build`

**Either kind: the stylesheet goes in the page.** A drawn page arrives as
markup, and a browser paints none of it until it has the stylesheet — as a file
of its own, a second round trip before the first paint. So once the app's vite
has bundled, the `index.html` it wrote has each stylesheet it links written
into it as a `<style>`, and one response paints the page. It is done once, to
the file in `dist/`, so `build`, `export`, `start` and moss's document all hand
out the same head. The stylesheet's own file stays in `dist/`.

```
nisc: /assets/index-DALMMv7I.css is in the page (0.7 kB) — one response paints it
```

A link is left as it is, and the build says why, when moving the stylesheet
could change what it means: the link says more than where the file is (a
`media`, a `title`), the file is not in `dist/` (another origin, a vite `base`),
or the stylesheet names another file relative to itself (`url(font.woff2)`,
`@import`). Vite writes those as absolute paths, which survive.

`stylesheet: 'file'` in the config turns it off — what an app needs when its
host sends a `Content-Security-Policy` that forbids inline styles. With
`--skip-bundle` the page is taken as it is: whoever built it finished it.

**An app with its own shell.** Bundles the app, then for every path boots it,
draws it, and checks what it drew:

```
  Route  First screen
○ /      drawn · whole · same twice · adopted   (todo-list, topbar)
         opened with todo-list.loadTodos (/api/query), topbar.loadStats (/api/query) — in the file as answered at build
         can still call todo-list.completeTodo (/api/todos/{{$.toggleId}}/done), todo-list.loadTodos (/api/query)
         waits on todos-changed
```

| Check | Fails the build when |
|---|---|
| **drawn** | the boot threw, or the screen drew to nothing |
| **whole** | something was still loading when `waitMs` ran out — a file that says "loading" is not the page |
| **same twice** | a second boot drew different markup (it says where they part) — the page's boot would not match the file |
| **adopted** | inside a DOM, a third boot ran the app's own `adopt` over the markup and the adapter complained: a hydration error, or a rebuilt root that is not what it was handed |

And one that holds by construction: `shell` is handed a path and nothing else,
so a file is only ever the screen **as nobody in particular sees it**.

What cannot be failed is reported, read off the actions on the first screen:
which endpoints it **opened with** (their answers are in the file as they were
at build — if one answers differently in the page, the page's shell draws that
part again), which it **can still call**, and which channels it **waits on**.
All of those keep working: the shell is in the page.

Exit code 1 if any check did not hold.

**An app behind moss.** Bundles the terminal (the app's own vite), stands the app up, draws every path
once **for nobody**, and prints how each one is served:

```
  Route   What        Served as  Because
● /       the app     server     auth.login: a person can act on it
                                 auth.login: it calls the function endpoint "enter", which is code
○ /about  page about  file       nothing on it can still happen

○  file    drawn once, for nobody in particular; nothing on it can still happen
●  server  something on it can still happen; it wants moss behind it
```

The verdict is not configured anywhere. It is read off the actions mounted on
each path: a trigger a person can fire, a field they can type in, a channel the
screen waits on, a read that keeps answering, a function it calls. A path with
none of those is finished the moment it is drawn. A read made while the page
opened is named too ("drawn with …") — its answer is in the file as it was at
build.

Exit code 1 if a path could not be drawn at all.

## `nisc export`

`nisc build`, then the site as a folder (`out/` by default, `--out <dir>`): the
bundle, and one `index.html` per path — `/` at the top, `/about` at
`about/index.html` — which is what any static host serves for that path.

A file is **only ever the page as nobody sees it**. No credential reaches a
build, so there is nothing to leak into one.

For an app with its own shell that is the whole deployment: the folder goes on
any static host, each path answers with its screen, and the bundle's shell
picks it up. If a check did not hold, **nothing is written**.

For an app behind moss: if any path wants a server behind it, **nothing is written** and the command
says which paths and why (exit code 1). A folder cannot be a server. When one
will stand beside the files — the socket at `/socket` on the same origin —
`--allow-live` writes the site anyway: each such file is a true first screen,
and its terminal connects.

A folder carries no headers, so what a browser may keep of it is the host's to
say. What `nisc start` says is the rule to give it: everything under `/assets/`
kept for a year (`public, max-age=31536000, immutable`), everything else asked
about each time (`no-cache`).

## `nisc start`

**An app with its own shell:** serves the built folder, and answers each path
with its first screen drawn from a fresh boot — per request, so the screen is
as the app answers now, not as it answered at build. No shell is kept.

**An app behind moss:** serves the built terminal from the app's own process: files from `dist/`, and
every page **drawn for whoever is asking** — the app's own screen at `/`, a
manifest page at its path. A signed-in person gets their screen in the markup
(`private, no-store`); nobody gets the page as nobody sees it. `--port <n>`, or
`$PORT`, default 8787. A name with an extension that is neither a file in
`dist/` nor a page is a missing file, answered 404 — never a screen.

**Either kind**, around the app's handler:

- **What a browser may keep.** What the bundler wrote under `/assets/` is named
  by its content: `public, max-age=31536000, immutable` — kept for a year, not
  asked about again. Every other file is `no-cache`: asked about each time, and
  answered `304` when it has not changed. An answer that already says for
  itself is left alone — a drawn document does (`no-cache` for nobody,
  `private, no-store` for somebody).
- **How it travels.** Text a browser reads — the document, scripts,
  stylesheets, JSON, SVG, wasm — goes out compressed, brotli or gzip by what
  was asked for (`Vary: Accept-Encoding`), a piece at a time: an answer that
  streams still streams. Fonts and images are already compressed and are left
  alone, and so is an event stream.

Neither touches the app server's own paths (`/api`, `/catalog`, `/socket`,
`/operator`, `/integrations`): what those answer is theirs to say.

The bundler copies the app's `public/` into `dist/` as it is. A file of the
app's own under `public/assets/` would be kept for a year under a name that
says nothing about its content — `nisc build` says so when it finds one. Keep
such files elsewhere in `public/`.

## `nisc dev`

The app's own vite, started from here (`--port <n>`). For an app behind moss
the app server runs inside it — moss's dev plugin (`@niscorp/moss/vite`), fed
from `nisc.config.ts`, so the dev server boots and draws exactly what `build`
and `start` do:

- `/`, and every page's path, is answered with its first screen drawn — and is
  still a vite page (its client, the framework's refresh preamble);
- moss's own paths (`/api`, `/catalog`, the socket, …) go to the app server,
  everything else to vite;
- an edit under `src/app`, `src/server`, `src/db`, `src/ui` or to the config
  re-boots the app (a fresh database, fresh shells) and reloads the page — the
  old server answers until the new one is up;
- `dev.signIn(server, who)` in the config, if the app gives one, makes
  `/dev/as/<who>` a signed-in URL — in the dev server and nowhere else.

The app's `vite.config.ts` holds its framework's plugin and nothing about the
server. An app with its own shell is a vite app and nothing more.

## `nisc check`

The app's check suite (`src/dev/all-checks.ts`, or `checks` in the config), run
with the app's own `tsx`. Its exit code is the suite's.

## Options

| | |
|---|---|
| `--root <dir>` | the app's root (default: the current directory) |
| `--out <dir>` | `export`: where the files go (default `out`) |
| `--allow-live` | `export`: write even though some path wants a server |
| `--skip-bundle` | `build`, `export`: the terminal is already built — it is neither bundled nor has its stylesheet written into its page |
| `--port <n>` | `dev`, `start`: the port (`start`: `$PORT`, then 8787) |

## License

Apache-2.0
