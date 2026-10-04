---
"@niscorp/charter": patch
"@niscorp/cli": patch
"@niscorp/cortex": patch
"create-nisc": patch
"@niscorp/loom": patch
"@niscorp/moss": patch
"@niscorp/nova": patch
"@niscorp/prism": patch
"@niscorp/signal": patch
"@niscorp/solid": patch
"@niscorp/strata": patch
"@niscorp/tide": patch
"@niscorp/vex": patch
---

Every package exports its `package.json`, so an app can say which version of a package it runs by reading it from the package:

```ts
import prism from '@niscorp/prism/package.json' with { type: 'json' };
prism.version; // the version that is installed, not the range that asked for it
```

Until now the `exports` map hid it, and the only way to the version was a path into `node_modules`. `check:packages` installs the tarballs and reads every package's version this way.

**What to change:** nothing. An app that read a version by path can read it by name.
