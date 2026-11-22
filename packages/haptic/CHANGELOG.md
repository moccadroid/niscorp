# @niscorp/haptic

## 0.3.0

### Minor Changes

- 1135474: BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless an app passes `prepareArtifact` an artifact whose `stamp` has an entry that is not a number of migrations (`{ "nisc.haptic": "v0" }`); it now throws `ArtifactError` with code `UPGRADE`, where it accepted the artifact unmigrated.

  `prepareArtifact` refuses an artifact whose `stamp` entry for `nisc.haptic` or `nisc.prism` reads as no number, with `ArtifactError('UPGRADE')` and strata's sentence ("The stamp's entry for nisc.haptic is \"v0\": not a number of migrations."). It read such an entry as current and ran no migration. Stamps haptic writes are always numbers.

### Patch Changes

- Updated dependencies [48138de]
- Updated dependencies [da3037e]
- Updated dependencies [e957628]
- Updated dependencies [c30562a]
- Updated dependencies [efd2368]
- Updated dependencies [ca26810]
- Updated dependencies [800a541]
- Updated dependencies [9c5367b]
- Updated dependencies [322f241]
- Updated dependencies [a41edf9]
- Updated dependencies [eb4ffb9]
- Updated dependencies [ae647e8]
- Updated dependencies [2effb54]
- Updated dependencies [bd996ea]
- Updated dependencies [180787b]
- Updated dependencies [d53910e]
- Updated dependencies [276f457]
- Updated dependencies [413afbd]
- Updated dependencies [1f6d37d]
- Updated dependencies [d77baf9]
- Updated dependencies [3f92c52]
- Updated dependencies [841c010]
- Updated dependencies [d93170b]
- Updated dependencies [d85bab1]
- Updated dependencies [aeaf803]
- Updated dependencies [2b174f8]
- Updated dependencies [df79faf]
- Updated dependencies [133c0ee]
- Updated dependencies [543f79d]
- Updated dependencies [61b15e4]
- Updated dependencies [7e8f6d4]
- Updated dependencies [5c52ef5]
- Updated dependencies [66eb934]
  - @niscorp/cortex@0.2.0
  - @niscorp/prism@0.4.0
  - @niscorp/signal@0.2.0
  - @niscorp/strata@0.2.0

## 0.2.0

### Minor Changes

- eaf381a: **Haptic renders a page only where Node closes the network to the page's scripts: Node 25 or later.** jsdom is not a sandbox. A page's inline script reaches Node itself in the render process, and on Node 24 and earlier that process could open connections to any address (private and cloud-metadata addresses too, past the transport the app hands Haptic). It could also signal any process of the same user, or open the app's own inspector and run code in the app. Discovery renders any level where 3 or more links share one address with different texts, which the page's author decides. A run renders when the artifact says `render: true`.

  Now the render process starts under Node's permission model with no network, which Node enforces from version 25, and `process.kill` and `process._debugProcess` are removed before the page runs. On Node 24 and earlier nothing is rendered: the page is read as fetched, as a page that cannot be rendered always was.

  BREAKING — approved by moccadroid, 2026-11-17: run on Node 25 or later (26 is the LTS) to keep rendering pages. On Node 24 and earlier, an artifact with `render: true` and discovery on a page whose links a script writes read the page as fetched.

  `@niscorp/nisc` installs Haptic, so it moves with it.

## 0.1.1

### Patch Changes

- 8af2922: **`@niscorp/nisc` installs `@niscorp/haptic`.** The bundle is every nisc package at the version it was released with, and Haptic was missing from it. AGENTS.md lists Haptic in the toolbox: what it is for and what stays the caller's.

  **Haptic accepts zod from 4.2.0, as every nisc package does.** 0.1.0 asked for `^4.6.5`, so an app on zod 4.2 to 4.5 was warned about a peer it could keep. Haptic's package check passes with one zod 4.2.0 copy shared by Haptic, Prism, Strata, Cortex and Signal: the saved artifacts run and every entry point typechecks.

  **What to change:** nothing.
