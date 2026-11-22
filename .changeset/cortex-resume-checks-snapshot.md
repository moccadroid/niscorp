---
"@niscorp/cortex": patch
---

BREAKING (pending consolidation): nothing unless an app passes `resumeRun` a snapshot it cannot resume and relied on how that failed.

`resumeRun` now checks the parts of a snapshot a resumed run cannot do without, and throws `[cortex:config] snapshot cannot be resumed: <what is wrong>` when one is missing: a `messages` list, and a `pending` with its `call` and `remaining` list. Before, such a snapshot failed in different ways: a `TypeError` from `resumeRun` with no `messages`, or a run ending `unknown` with `cfg.resumePending.remaining is not iterable`. Every snapshot that resumed still does, `null` in its optional fields included (`pending: null`, `steps: null`).
