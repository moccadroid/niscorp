---
"@niscorp/tide": patch
---

BREAKING (pending consolidation): nothing unless an app sorted or parsed the ids of tide's Postgres rows by their old shape (`fact_mwi60d3d_1`) — including a sort on `created_at` that breaks ties on `id`: runs made in one advance share `created_at`, and UUIDs order them at random; break such ties on `due_at`.

The Postgres store mints the ids of new `fact`, `run` and `task` rows as UUIDs. They were the time and a per-process counter, so two processes on one database could mint the same id in the same millisecond, and the second write failed (`duplicate key value violates unique constraint "tide_fact_pkey"`); under moss that write fact was lost. Rows already written keep their ids; no table changes. The memory store keeps its `fact_1` ids.
