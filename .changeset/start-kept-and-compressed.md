---
'@niscorp/cli': patch
---

`nisc start` says what a browser may keep, and compresses what it sends — for an app with its own shell and an app behind moss alike. What the bundler wrote under `/assets/` goes out `public, max-age=31536000, immutable`; every other file is `no-cache` and answered `304` when it has not changed (an app with its own shell sent neither a validator nor a `Cache-Control` before, so a browser downloaded everything again on every visit). Documents, scripts, stylesheets, JSON, SVG and wasm go out brotli- or gzip-compressed, a piece at a time, with `Vary: Accept-Encoding`; the app server's own paths (`/api`, `/catalog`, …) are left alone. `nisc build` says so when it finds files of the app's own under `public/assets/`, which would be kept for a year under a name that says nothing about their content.
