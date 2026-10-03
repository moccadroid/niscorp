# @niscorp/cli

## 0.2.2

### Patch Changes

- 8a04243: `nisc start` says what a browser may keep, and compresses what it sends — for an app with its own shell and an app behind moss alike. What the bundler wrote under `/assets/` goes out `public, max-age=31536000, immutable`; every other file is `no-cache` and answered `304` when it has not changed (an app with its own shell sent neither a validator nor a `Cache-Control` before, so a browser downloaded everything again on every visit). Documents, scripts, stylesheets, JSON, SVG and wasm go out brotli- or gzip-compressed, a piece at a time, with `Vary: Accept-Encoding`; the app server's own paths (`/api`, `/catalog`, …) are left alone. `nisc build` says so when it finds files of the app's own under `public/assets/`, which would be kept for a year under a name that says nothing about their content.
- 8a04243: `nisc build` writes the built page's stylesheet into the page. Once the app's vite has bundled, each stylesheet `dist/index.html` links by a plain local path is written into it as a `<style>`, so a drawn page paints from one response instead of waiting on a second request for its look. It is done once, to the file in `dist/`, so `build`, `export`, `start` and moss's document all hand out the same head; the stylesheet's own file stays. A link is left as it is, and the build says why, when the link says more than where the file is, the file is not in `dist/`, or the stylesheet names another file relative to itself.

  **What to change:** an app whose host sends a `Content-Security-Policy` that forbids inline styles sets `stylesheet: 'file'` in `nisc.config.ts` — otherwise the page loses its look. Nothing else changes for an app; with `--skip-bundle` the page is taken as it is.

## 0.2.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.

## 0.2.0

### Minor Changes

- 3a9866e: `nisc dev` starts the app's own vite itself (`--port`), and for an app behind moss adds moss's dev plugin fed from `nisc.config.ts` — the same boot and drawing `build` and `start` use. An app's `vite.config.ts` no longer carries any server glue. `NiscMossProject.dev.signIn(server, who)` makes `/dev/as/<who>` a signed-in URL in development.

### Patch Changes

- Updated dependencies [3a9866e]
  - @niscorp/moss@0.2.0
