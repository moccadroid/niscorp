---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

`session.draft.add` is what `session.draft.put` was. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-18: rename `session.draft.put(...)` to `session.draft.add(...)`. Nothing else about it changes: it takes what `save` takes, what is added is in that one shell when the add answers, and `save`, `discard`, `show`, `remove` and `list` are as they were.
