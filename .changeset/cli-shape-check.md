---
"@niscorp/cli": patch
"create-nisc": patch
"@niscorp/nisc": patch
---

A shape check, `runShapeCheck` from the new entry `@niscorp/cli/shape`: it reads an app's source and its actions for what its own checks cannot see — rule 16 by the TypeScript compiler, formatting outside Prism, roles read in server code, the kit reading files, the address or the document, code in `src/app` called while the app runs — and fails on every server function an action calls that the app has not named with why it is not a vex read or write. What an app allows, it names per rule and per file, each with its reason. It reads with the app's own TypeScript (6.x) and adds no dependency.

`create-nisc` writes it into every app as `src/dev/shape-check.ts`, run by `npm run check`. The rulebook's "Verification" and `REVIEW.md` say what it does.

**What to change:** nothing; an app that does not call it is not checked. To check an app made before this, copy `src/dev/shape-check.ts` from a new one, add it to `src/dev/all-checks.ts`, and name what it reports.
