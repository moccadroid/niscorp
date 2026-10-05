---
"@niscorp/solid": patch
---

`select(path).onFinal(listener)` added after the reply has ended is called, at once.

A selection learns that the reply ended from the root, once. A selection first made after that — `stream.select('widget')` called for the first time when the closing `}` had arrived, or after `close()` — was never told, so a listener given to its `onFinal` was never called: not at once, not after `close()`, not after a later write. Its `final()` did resolve, and the root's own `onFinal` was called at once in the same position.

Such a listener is now called at once with the part's value, as the root's is, and once.

Everything else is as it was. A listener added while the reply is still arriving is called when its part finishes — or, if the part had already finished when the selection was first made, by the next write, as before. One added from inside a root `onFinal` listener is called after it, as before.

**What to change:** nothing, with one thing to know. Where the reply had already ended, this listener used to be dropped and is now called inside the `onFinal()` call itself, before `onFinal()` has returned. A listener that calls its own unsubscribe — `const off = sel.onFinal(() => { off(); … })` — cannot name `off` yet at that moment and throws; that is already so for the root's `onFinal`, and for a selection made before the reply. Write `let off = () => {}; off = sel.onFinal(…)`, or do not unsubscribe a listener that is only ever called once.
