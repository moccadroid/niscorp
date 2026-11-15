---
"@niscorp/cli": patch
---

`nisc export --out` refuses a folder that is the app's, one above it, or the build, instead of deleting it; the export only ever empties its own folder.
