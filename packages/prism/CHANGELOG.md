# @niscorp/prism

## 0.2.2

### Patch Changes

- 7f8d202: Under `require`, the entry points of nova, prism and strata share one copy of their code, as they always have under `import`.

  The CommonJS build was not split, so every entry point carried its own copy of each class and of each React context. The ESM build is byte for byte what it was. Under `require`:
  - an error from `@niscorp/strata/postgres`, `/check`, `/upgrade` or `/node` is an `instanceof` the `StrataError` that `@niscorp/strata` exports; one from `prismTransform` of `@niscorp/prism/migrations` is an `instanceof PrismError`; one from `<Nova.Layout>` is an `instanceof NovaError` and of its own class. None of them was.
  - `upgradeStore` names the row it refused — `integration_actions (integration_id="…", action_id="…"): …`, with the upgrader's error as its `cause` — and so does a moss boot that meets a stored row it cannot read. Both gave the upgrader's sentence alone.
  - a kit registered from `@niscorp/nova/adapters/react/components` renders under `<Nova.Shell>`. It threw `useShell must be used inside <NovaShellProvider>`.

  **What to change:** nothing in an ESM app. A CommonJS app that had built on any of the above — a branch that ran because `instanceof` failed, a match on the whole text of an `upgradeStore` refusal — now sees what an ESM app sees. An app that loads both builds of one package in one process still has two copies of it.

## 0.2.1

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

- 259a6f7: `@niscorp/prism/examples` — the reference as data. `PRISM_EXAMPLES` is 82 examples (`{ id, group, title, description, op?, source, config, expected }`): one for each of the 73 operators, named by the operator, then nine configs of several operators working together. `PRISM_EXAMPLE_GROUPS` names the groups they come in — the reference's own (Core, Arrays, Math, …), in its order. The package's tests evaluate each example against its `expected`, and fail when an operator has no example of its own or has two, so whatever shows them shows what the installed version does. `OP_KEYS`, the grammar's operator names in its own order, is now exported from the main entry. STYLE_GUIDE.md gains "Examples": a change to what a package does changes its examples in the same commit.
- f801cc9: `prismTransform` is exported from the main entry: Prism in the shape a host's transform seam takes, `(config: unknown, source: unknown) => unknown` — what nova's shell, tide's engine and strata's upgrader are handed.

  ```ts
  import { prismTransform } from '@niscorp/prism';

  createTide({ store, transform: prismTransform, effects });
  ```

  `evaluate` is typed for a `JsonValue` source, so a host could not hand it to a seam without a cast, a JSON round trip or a parse of its own. `prismTransform` parses the config against `ConfigSchema` and refuses a source that is not plain JSON. It is the function `@niscorp/prism/migrations` has exported all along, and that export stays. Its refusal now reads `The source of a transform must be plain JSON.`; it said `A document to migrate must be plain JSON.`

  **What to change:** nothing. A host that wrote the join itself can pass `prismTransform` instead.

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
