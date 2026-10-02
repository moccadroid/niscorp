---
'@niscorp/moss': minor
'@niscorp/nisc': minor
---

Server-drawn pages, and pages.

- `renderDocument` draws a page request's first screen into the app's own `index.html` — the caller's shell read as it stands (`shells.snapshot`), drawn to a string by the app's kit (`@niscorp/moss/terminal/react/server`, `/vue/server`, `/dom/server`), with the snapshot beside it. `createWire({ initial: readDocumentSnapshot() })` starts from that snapshot, and the React and Vue targets adopt the elements already there. Who is asking comes off a cookie copy of the session token (`browserEnv({ cookie: true })`); who may keep the page follows from who asked (`documentHeaders`).
- `NiscApp.pages` — a shell manifest at a path (`"/docs/:slug"`), drawn for whoever asks and kept by nothing. `server.page(path)` and the socket's `?path=` route to it. `onSession` does not run for a page.
- `ShellSnapshot.live` / `shellNeedOf` — whether anything on a drawn screen can still happen. A page that is not live is served as markup and its terminal opens no socket (`WireStatus` gains `'static'`).
- `exportDocuments` — the same draw, for nobody, once per path: pages as files, each reporting whether it is live.
- `MossServer.principalOf(token)` — the deployment's own session verifier, for a route that receives a credential some other way than a Bearer header.
- `mountSite(server, { dist, draw, … })` in `@niscorp/moss/node` — the built terminal served by the app's own process: a file from `dist`, or `index.html` with the caller's screen drawn into it. `MossServer.pages` lists the manifest's pages and their paths.

**Breaking:** `wire.dispatch` and `wire.publish` are dropped unless the socket is open (they used to be handed to `socket.send` in any state, which a browser refuses while connecting). `ShellHost` gains `snapshot`; `MossServer` gains `principalOf` and `page` — a hand-built stand-in for either needs them. The socket protocol is unchanged: `?seed=` and `?path=` are optional and older servers ignore them.
