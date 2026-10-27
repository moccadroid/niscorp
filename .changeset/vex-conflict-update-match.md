---
'@niscorp/vex': patch
---

An insert's `onConflict.set` is held to every `match` rule of the update phase, one on a column of the conflict target included: each becomes a WHERE on the DO UPDATE half, so a conflict with a row the caller may not update writes nothing and returns no row.

Before, a `match` on a conflict-target column was left out, on the reasoning that the insert pins that column from scope. Where the policy's insert phase does not pin it — no insert rule for that column, or two merged roles of which one may insert anywhere — an entry that takes that column's value from the caller let them overwrite, and read back, a row their update rule excludes.
