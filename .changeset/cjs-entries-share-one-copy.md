---
'@niscorp/nova': patch
'@niscorp/prism': patch
'@niscorp/strata': patch
---

Under `require`, the entry points of nova, prism and strata share one copy of their code, as they always have under `import`.

The CommonJS build was not split, so every entry point carried its own copy of each class and of each React context. The ESM build is byte for byte what it was. Under `require`:

- an error from `@niscorp/strata/postgres`, `/check`, `/upgrade` or `/node` is an `instanceof` the `StrataError` that `@niscorp/strata` exports; one from `prismTransform` of `@niscorp/prism/migrations` is an `instanceof PrismError`; one from `<Nova.Layout>` is an `instanceof NovaError` and of its own class. None of them was.
- `upgradeStore` names the row it refused — `integration_actions (integration_id="…", action_id="…"): …`, with the upgrader's error as its `cause` — and so does a moss boot that meets a stored row it cannot read. Both gave the upgrader's sentence alone.
- a kit registered from `@niscorp/nova/adapters/react/components` renders under `<Nova.Shell>`. It threw `useShell must be used inside <NovaShellProvider>`.

**What to change:** nothing in an ESM app. A CommonJS app that had built on any of the above — a branch that ran because `instanceof` failed, a match on the whole text of an `upgradeStore` refusal — now sees what an ESM app sees. An app that loads both builds of one package in one process still has two copies of it.
