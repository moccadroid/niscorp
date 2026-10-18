---
'@niscorp/moss': patch
'@niscorp/nisc': patch
'@niscorp/cli': patch
---

What a person generated and nobody has used for long enough is deleted, with `runtime.artifactsUnusedMs`.

- A version of an artifact a person saved is stamped as used (`artifacts.last_used_at`, migration `nisc.moss/6`) when a shell is built for them, once an hour at most, through the same vex entries and row rule as the save itself.
- A sweep runs as the server comes up and then every hour: every artifact of a person whose newest version was neither saved nor used within `artifactsUnusedMs` is deleted, every version of it, and the saves left empty with them. What is published for everybody (`*`) never ages; what the build ships is not a row.
- Without the setting nothing is deleted. `0` or less refuses the boot.
- The sweep is one raw statement in moss (`data/aging.ts`), entered in the raw-SQL ledger: vex keeps every statement of its own to one principal's rows, and the sweep crosses them all.
