# @niscorp/cli

`nisc` — the command for a nisc application.

```bash
pnpm add -D @niscorp/cli
```

```bash
nisc dev       # the app's dev server
nisc build     # bundle the terminal, then say how each path is served
nisc export    # build, then write every path as a file — the site as a folder
nisc start     # serve the built terminal from the app's own process, pages drawn
nisc check     # the app's check suite
```

## What an app writes

One file at its root, `nisc.config.ts`, exporting `project` — the two things
only the app knows:

```typescript
import type { NiscProject } from '@niscorp/cli';
import { renderSnapshot } from '@niscorp/moss/terminal/react/server';
import { boot } from './src/server/boot';
import { buildRegistry } from './src/ui/registry';

const registry = buildRegistry();

export const project: NiscProject = {
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
| `checks?` | the check suite `nisc check` runs (default `src/dev/all-checks.ts`) |
| `tokenKey?` | the wire's token key, when it is not `nisc.token` |

The config is TypeScript, loaded with the app's own `tsconfig.json` — path
aliases included.

## `nisc build`

Bundles the terminal (the app's own vite), stands the app up, draws every path
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

If any path wants a server behind it, **nothing is written** and the command
says which paths and why (exit code 1). A folder cannot be a server. When one
will stand beside the files — the socket at `/socket` on the same origin —
`--allow-live` writes the site anyway: each such file is a true first screen,
and its terminal connects.

## `nisc start`

Serves the built terminal from the app's own process: files from `dist/`, and
every page **drawn for whoever is asking** — the app's own screen at `/`, a
manifest page at its path. A signed-in person gets their screen in the markup
(`private, no-store`); nobody gets the page as nobody sees it. `--port <n>`, or
`$PORT`, default 8787.

## `nisc dev`, `nisc check`

Hand over to tools the app already has: its vite config (which hosts the app
server, so pages are drawn in dev too), and its check suite.

## Options

| | |
|---|---|
| `--root <dir>` | the app's root (default: the current directory) |
| `--out <dir>` | `export`: where the files go (default `out`) |
| `--allow-live` | `export`: write even though some path wants a server |
| `--skip-bundle` | `build`, `export`: the terminal is already built |
| `--port <n>` | `start`: the port |

## License

Apache-2.0
