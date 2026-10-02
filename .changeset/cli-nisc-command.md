---
'@niscorp/cli': minor
---

`@niscorp/cli` — the `nisc` command. `nisc build` bundles the terminal and says how each path is served (a file, or a server, and why); `nisc export` writes the site as a folder — only ever the page as nobody sees it, and nothing at all when a path wants a server unless `--allow-live`; `nisc start` serves the built terminal from the app's own process with its pages drawn; `nisc dev` and `nisc check` hand over to the app's own vite and check suite. An app writes one file, `nisc.config.ts`, exporting `project`: how it boots and how one of its screens is drawn.
