---
"@niscorp/nova": patch
---

The README's quick example runs as written. It registered no components, so it printed an error node (`COMPONENT_NOT_FOUND: Component not found in registry: Box`) where its comment promised the tree — and with components registered, `console.log` would still have printed the tree's children as `[Object]`. It now takes the terminal kit (`defaultRegistry()` from `@niscorp/nova/adapters/tty/components`), writes its text as children, the way the kits draw it, sends one press, and prints the whole tree; what it prints is in the README. No code changed.

**What to change:** nothing.
