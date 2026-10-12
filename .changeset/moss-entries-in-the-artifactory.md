---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

Moss holds an app's entries itself, in memory, and copies none into `vex_cache`. `server.replaceEntries(source, entries)` hands a set of entries over while a server runs. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-12: an app that runs a vex engine of its own over `runtime.cache` gives that engine the entries it replays (`seedCache(cache, entries)`), and an app that wrote an entry into that table for moss to serve hands it over with `server.replaceEntries(source, entries)`.

- **Where a fingerprint resolves.** The entries an app ships are read from the build at every boot and held by the running manifest, compiled as vex replays them. The engine asks it first, and the cache table (`vex_cache`, or what `runtime.cache` hands over) only for what vex wrote itself while the app runs, such as a query `session.answerIntent` wrote. A boot still refuses an entry vex cannot run.
- **Nothing is copied into the cache table, and a row in it that no request wrote is not replayed.** Until now every entry was written there at each boot, and a replay resolved in the table. Moss now answers from the table only for a row vex wrote for a request (it carries that request's hash). The rows an earlier release wrote stay where they are and are answered from no longer: an entry the app stopped shipping is refused (`cache_miss`), where it went on answering before. Moss deletes none of them.
- **`server.replaceEntries(source, entries)`** is new, and is to entries what `server.replaceActions` is to actions: a named set, replaced whole, checked before it is taken (the schema the manifest's entries are read by, vex's authoring lint for a write, the reach it declares), frozen, and this process's alone. An entry of a set is replayed in place of one the app shipped under the same fingerprint.
- **The list of fingerprints** a feature or a discovery is told of holds the entries in force and the queries vex wrote. An app whose `runtime.cache` could not list its rows (vex's tiered cache) was told of none; it is told of the entries in force now.
- **`nisc migrate`** is as it was. Its pass for an entry that already did not fit before a run asks the cache table for a copy of that entry. Moss writes no such copy from this release on, so in a database only moss writes to, an entry first shipped from now on gets no pass. A copy an earlier release wrote, or one the app writes itself for an engine of its own, still gives one.
- **What a discovery says of an entry of the app.** `createdAt` is when this process compiled it, and `lastUsedAt` is not said: a replay of an entry moss holds stamps nothing. Both came from the row in the table before.
- **The refusal for a set that is not the caller's** says `the set "…"` where it said `the set of actions "…"`: a set holds entries too.
- The CLI and `@niscorp/nisc` change in the moss they bring; `AGENTS.md` says where entries are held.
