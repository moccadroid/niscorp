---
"@niscorp/strata": patch
"@niscorp/nisc": patch
---

`strata upgrade` writes POSIX-style relative paths (`src/forms.ts`, `.strata/upgrade/expected/…`) into `REPORT.md`, `plan.json` and its log on every platform — on Windows they came out with backslashes.
