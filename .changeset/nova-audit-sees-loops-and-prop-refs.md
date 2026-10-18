---
'@niscorp/nova': patch
---

`auditAction` sees through a loop and into a component's props.

- A loop variable bound under the data root — `$.row.name`, `$.index`, `$.items` inside a `for`/`as` — is no longer reported as a key `data` has no default for: the renderer binds them there.
- A ref a component dispatches from inside its props, at any depth (a Table's `menu.items[0].ref`), is no longer reported as carried by no layout node. `collectInteractive` names such a ref's `via` by the prop's path (`menu.items.0.ref`).
- `classifyAudit(issue)` of `@niscorp/nova/reflect` takes the issue alone and keeps one downgrade, a push whose target is a `{{…}}` template; its loop-variable and prop-ref downgrades had nothing left to downgrade.
