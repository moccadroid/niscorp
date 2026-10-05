---
"@niscorp/tide": patch
---

`retry()` takes its task off the run's `failed` count whatever state the run is in.

The count used to come down only together with the rewind from `settled` to `fanned`. So the second of two tasks retried before either ran again, or a task retried while its run was still going, was reopened with `failed` left one too high. Two things followed: a run of six that ended with every task `done` said `done 6, failed 1`; and a run counting a failure it no longer had reached its total one task early, settled, and minted its run fact with false counts while a task was still pending — a reflex on `{ fact: { run } }` fired on it.

The count now comes down unconditionally, in the same transaction as the reopen; only the rewind waits for a settled run.

**What to change:** nothing. A host that retried failed tasks one at a time, with an `advance` between, to keep the counts right can retry them together.
