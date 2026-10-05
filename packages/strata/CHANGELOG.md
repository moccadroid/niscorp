# @niscorp/strata

## 0.1.2

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

- 1e6d55d: A pool's `query` and `transaction` are called on the pool, and a transaction's `query` on the transaction — never taken off the object first. A driver's own object has them as methods that need their receiver, and taken off they failed inside the driver, on a property nothing in nisc names:
  - **strata** — `migrate` and `upgradeStore` over a `PGlite` threw `Cannot read properties of undefined (reading '_checkReady')`; `status` and `readLedger` did too, once a ledger existed. A pool whose `transaction` hands a checked-out `pg` client through as the transaction failed in `migrate` the same way.
  - **moss** — `createTideStore` took `query` off the transaction. Over a pool that hands its client through, every transaction of the store failed inside the driver, and tide recorded the run as deferred: nothing threw, and the effect never ran.
  - **vex** — `createPostgresAdapter` with a read limit set (`limitReads`) threw on a pool whose `transaction` is a method.

  A `PGlite` now works as a pool as it is, and so does a `pg` wrapper that passes its client through. A pool built from closures (`createPglitePool`, a wrapper that builds its own `query`) behaves as before.

  **What to change:** nothing.

## 0.1.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.
