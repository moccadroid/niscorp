# @niscorp/signal

## 0.1.2

### Patch Changes

- fe30458: Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

  ```ts
  import prism from '@niscorp/prism/package.json' with { type: 'json' };
  prism.version; // the version that is installed, not the range that asked for it
  ```

  Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

  **What to change:** nothing. An app that read a version by path can read it by name.

## 0.1.1

### Patch Changes

- b67a125: Documentation only: each package's README, reference and design docs checked against its source and corrected — install lines and peers, signatures, defaults, status codes, licenses (loom, signal: Apache-2.0), and API that existed but was not documented.
