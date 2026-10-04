# @niscorp/prism

## 0.2.0

### Minor Changes

- f1cec45: A Prism config that validates no longer names an op Prism does not have. `validate` accepted `{ card: { $fetch: … } }` and `{ $eval: "…" }`: the plain-object branch refused only the names of ops that exist, so any other `$` key passed as a template key. Such a config could be stored — an endpoint request, a vex mapping, a strata migration — and then failed every time it was evaluated (`E_NODE_SHAPE`, "Unsupported node shape").

  A key that starts with `$` is now an op's name and nothing else. The template branch refuses every `$` key — the rule the evaluator already held — so `validate` reports it with the key and where it is (`card.$fetch: Not a Prism op. A key that starts with "$" names an op; data with such a key goes in $const.`), and `evaluate` and `compile` fail with `E_SCHEMA` before anything runs. An op's name used as a template key keeps its own message. `E_NODE_SHAPE` is left for a tree that never went through the schema: an IR handed to `execute`. Adding an op no longer takes a key away from templates.
  - **prism** — the change, and a grammar narrowing: `nisc.prism` 2, a marker with no document step (a key that never evaluated has nothing to be rewritten to). `$` keys that are data are untouched: a `$const` payload, `$with` names, `$renameKeys` and `$fromEntries` keys. The JSON Schema's template key pattern is `^(?!\$)` instead of a list of every op.
  - **nova, vex, moss, loom, cli, nisc** — no change of their own. They depend on prism and are released with it, so the set installs together; the configs they hand to prism (endpoint `request` and `response`, `$prism` bindings, vex mappings) are held to the same rule.
  - **create-nisc** — the templates' sources are recorded at `nisc.prism` 2.

  **What to change:** in a config with a `$`-prefixed key that is not a Prism op, remove the key — or put the object in `$const` if it is literal data. An app that keeps a `strata.lock.json` runs `pnpm strata upgrade`, then `pnpm strata verify`; there is nothing to edit unless it has such a config. Everything else: nothing.

  BREAKING — approved by moccadroid, 2026-10-04: a config with a `$`-prefixed key that is not a Prism op no longer validates, compiles or evaluates — also where evaluation never reached the key (an untaken `$case` branch, a short-circuited `$or`, a `$map` body over an empty array), which used to work. A vex seed mapping with one fails when it is seeded, at boot, instead of on each replay. Code that matched `E_NODE_SHAPE` from `evaluate` gets `E_SCHEMA`. The `@niscorp` packages that depend on prism move with it, so an app moves them together (`@niscorp/nisc` 0.3.0).

## 0.1.2

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.

## 0.1.1

### Patch Changes

- 534eb4b: `@niscorp/strata` is a required peer: nova's shell and layout store and Prism's engine import its document-depth limit at load time, and with strata declared optional an app installing nova or Prism without it crashed on import. `check:packages` now follows every built entry's imports and refuses an undeclared one, or an optional peer loaded by a main entry.
