---
"@niscorp/moss": patch
---

`server.charterReport()` — the charter report the server was verified by.

`createServer` runs `verifyCharter` at boot and again on every `refresh`, refuses on the report's `errors`, and read nothing else of it. The rest was computed and dropped: the `warnings` (an action no role grants, an `allow` that matches nothing) and each role's closure `issues`. A host that wanted them had to run `verifyCharter` itself, over a data universe it built by hand.

`charterReport()` returns that report: boot's, then that of each `refresh` that passed. A refresh that is refused leaves the one the server is still serving on. Nothing is printed, and boot refuses exactly what it refused before.

```ts
const server = await createServer(app, runtime);
for (const warning of server.charterReport().warnings) console.warn(`${warning.rule}: ${warning.detail}`);
```

DOCS.md says one thing about what it holds: a push whose target is a binding (`@event.payload`, `$.target`) is listed among a role's `issues` as "not in the catalog", though it is resolved when the step runs.

**What to change:** nothing.
