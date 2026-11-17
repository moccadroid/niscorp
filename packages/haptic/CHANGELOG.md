# @niscorp/haptic

## 0.1.1

### Patch Changes

- 8af2922: **`@niscorp/nisc` installs `@niscorp/haptic`.** The bundle is every nisc package at the version it was released with, and Haptic was missing from it. AGENTS.md lists Haptic in the toolbox: what it is for and what stays the caller's.

  **Haptic accepts zod from 4.2.0, as every nisc package does.** 0.1.0 asked for `^4.6.5`, so an app on zod 4.2 to 4.5 was warned about a peer it could keep. Haptic's package check passes with one zod 4.2.0 copy shared by Haptic, Prism, Strata, Cortex and Signal: the saved artifacts run and every entry point typechecks.

  **What to change:** nothing.
