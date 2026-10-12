---
'@niscorp/moss': patch
---

Moss's source has a module for what the running app consists of, `artifactory`. Nothing an app imports, calls or is handed changes.

- What is in force while a server runs, what a set of roles holds of it, and the clock of the generation pointer are in `artifactory`, where they were in `manifest`. `manifest` keeps the app as it is handed over: its types, its schema and its verification.
- `DESIGN.md`, "How the code is laid out", says which module answers what.
