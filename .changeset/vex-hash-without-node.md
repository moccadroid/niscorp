---
"@niscorp/vex": patch
---

Vex hashes without `node:crypto`, so `@niscorp/vex` and `@niscorp/vex/pglite` build for a browser as they are.

Every identity vex computes — `computeRequestHash`, `computeSchemaFingerprint`, the policy key behind the negative cache, a minted `fp_…`, and the row and answer hashes of a reactive read — is a SHA-256, and it came from `createHash` in `node:crypto`. A page has no such module, so a bundler refused the package (`"createHash" is not exported by "__vite-browser-external"`), and every app that runs vex over PGlite in the browser pointed its bundler's `crypto` at a shim of its own.

The hash is now vex's own (`src/utils/sha256.ts`): synchronous, self-contained, and the same digests as node's byte for byte. Nothing stored moves — a cache row's `request_hash` and `schema_fingerprint`, a `neg:` key and a fingerprint computed at build time by Node all still match what a page computes. The exported functions keep their signatures. It costs about three times node's own hash: 0.003 ms for a request identity, about 0.6 ms per 100 KB of rows.

**What to change:** nothing. An app that aliased `crypto` (or `node:crypto`) to a shim for vex can delete the alias, the shim and the dependency behind it.
