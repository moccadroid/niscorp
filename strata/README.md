# strata/ — the grammar gate's records

What `pnpm check:grammars` holds nisc's grammars (nova's and Prism's) to.

**`snapshots/<grammar>/<version>.json`** — what each document kind's schema
was at that version of the grammar, as JSON Schema (descriptions stripped:
rewording a `.describe()` is not a change). The gate fails when a kind's
schema differs from the snapshot of the grammar's current version: something
changed that older readers were never told about.

- Changed a schema? Append a migration to the grammar's sequence
  (`packages/nova/src/migrations`, `packages/prism/src/migrations`). An
  addition needs only an empty marker — strict readers at the old version must
  still refuse the newer documents. A rename or removal needs the steps that
  rewrite old documents. Then `pnpm strata:snapshot` records the new version.
- **A recorded snapshot is history. Never edit one.**

**`corpus/<app>/<stamp>.json`** — every action and fragment each lab app
ships, captured with the grammar stamp it was written at (`pnpm
strata:corpus`, after `pnpm build`). The gate upgrades every one to the
current grammars and parses it with the current strict schemas: the snapshot
says something moved, the corpus says whether real documents survive it.

- A capture for the current stamp may be refreshed while no grammar has moved.
  Once one gains a migration, the next capture lands in a new file and the old
  one is frozen — **never edit a corpus file from an earlier stamp**; it is
  exactly what the migrations are tested against.
