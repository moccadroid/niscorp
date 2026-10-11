---
"@niscorp/charter": patch
---

DOCS.md no longer tells an app to import `auditClosure` from `@niscorp/moss`. Moss stops exporting it (see the moss changeset): it supplies its own closure auditor whenever it verifies an app, at boot and in `verifyApp(app, grants)`. The `ClosureAuditor` section says so, and the usage pattern calls `verifyCharter` without an auditor, which is what a consumer with no auditor of its own does. No code changed.

**What to change:** nothing.
