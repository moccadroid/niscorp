---
"@niscorp/tide": patch
---

The memory store keeps no key for a value that was never given. A row appended with `as: undefined` — every fact a host ingests — kept the key in `createMemoryStore()` and has none when it is read back from a database (moss's store). So a transform that looks at which keys a fact has saw two different facts: Prism's `$has`, `$keys` and `$entriesOf` answered differently over the two. And a transform that takes plain JSON (`prismTransform`) refused every fact-triggered reflex under the memory store, where a refused `when` is recorded as `fact.unmatched` and the reflex does not fire. A `cas` that sets `undefined` already removed the key; an append now does the same. `STORE_CONTRACT` is unchanged.

The README's quick example type-checks under `strict`, and its install block covers what it imports. It passes `prismTransform` from `@niscorp/prism` as the transform (`evaluate(config, source)` did not compile: a `Row` is not a `JsonValue`), its preview no longer reads a field off an `unknown` input, and the install block adds `@niscorp/prism` and `@niscorp/strata`. DESIGN.md's plain-Node example follows.

**What to change:** nothing in an app. A check that compares a memory-store row key for key against an object that spells out `undefined` values (`toStrictEqual`) leaves those keys out.
