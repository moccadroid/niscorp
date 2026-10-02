---
'@niscorp/moss': patch
---

A shell build no longer awaits between the `functions`/`onSession` seams and the shell's creation: the app's `phrases` are resolved first. An `onSession` observer that defers its first touch of `session.shell` by a microtask reaches a built shell again, and so subscribes before the shell's mount calls answer.
