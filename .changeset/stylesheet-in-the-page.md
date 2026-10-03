---
'@niscorp/cli': patch
---

`nisc build` writes the built page's stylesheet into the page. Once the app's vite has bundled, each stylesheet `dist/index.html` links by a plain local path is written into it as a `<style>`, so a drawn page paints from one response instead of waiting on a second request for its look. It is done once, to the file in `dist/`, so `build`, `export`, `start` and moss's document all hand out the same head; the stylesheet's own file stays. A link is left as it is, and the build says why, when the link says more than where the file is, the file is not in `dist/`, or the stylesheet names another file relative to itself.

**What to change:** an app whose host sends a `Content-Security-Policy` that forbids inline styles sets `stylesheet: 'file'` in `nisc.config.ts` — otherwise the page loses its look. Nothing else changes for an app; with `--skip-bundle` the page is taken as it is.
