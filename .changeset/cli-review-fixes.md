---
"@niscorp/cli": patch
---

`nisc export --out` refuses a folder that is the app's, one above it, or the build, instead of deleting it; the export only ever empties its own folder.
`nisc start` on a port that is taken, or given a `--port` or `$PORT` that is not a port, says so in a sentence instead of crashing with Node's own error.
