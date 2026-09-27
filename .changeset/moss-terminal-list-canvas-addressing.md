---
'@niscorp/moss': patch
---

Typed numbers reach the right instance on a list canvas. The tty REPL and the ink target dispatch a numbered interactive with its `origin` (nova's `TtyInteractive.origin`), and ink resolves `[n]` markers per instance through a new `registerWireSlots` option, `instanceProvider`. Before, every tab on a tab bar printed `[1]` and every number opened the last one.
