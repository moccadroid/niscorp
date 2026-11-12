---
'@niscorp/tide': patch
---

A load can leave out each bad reflex alone (`isolate`), a clock's zone is checked, and a timer in the hour a clock turns back fires when it was set to.

- **`load(reflexes, { isolate: true })`** leaves out each reflex that would refuse the load — one that does not parse, a duplicate id, an unregistered effect, every reflex on an unguarded cycle, and one left watching the run of a reflex left out — and loads the rest. The report's new `refused` lists each, as `{ reflexId, code, message }`. Without `isolate` a load refuses whole, as before. It is for a host whose reflexes are its people's rows: in an app that keeps them that way, a member who wrote a reflex waking on every write to a table its own effect writes stopped every person's automations until the next boot, and the boot with it.
- **A clock's `tz` is a zone `Intl` knows** (`TimeZoneSchema`), refused where the reflex is parsed. One it did not know was accepted, and then every `advance` and `nextDue` threw, for everybody: DOCS promised an advance does not crash because one reflex is broken. No document changes: a reflex with such a zone could never fire.
- **`reflexSchemaOf({ triggers })`** parses a stored reflex with only the trigger kinds a host offers (`REFLEX_TRIGGERS`), as `draftSchemaOf` does for a draft. `reflexSchemaOf()` is `ReflexSchema`.
- **`anchorDraft` keeps a timer in `UTC` where the host's local time would name another instant.** In the hour a clock turns back, the local time is shown twice and was read as its first pass: a ten-minute timer saved at 02:55 CEST in Vienna on the last Sunday of October fired an hour early — before it was saved, so in fact never. Everywhere else it is kept in the host's zone, as before.
- `GraphReport`'s refusals name the `reflexIds` each is about (`GraphRefusal`).
- `isolate` keeps one tenant's bad reflex from stopping another's only where the host owns the ids (a duplicate leaves out every reflex after the first) and one tenant's triggers never wake on another's writes (every reflex on an unguarded cycle is left out, whoever's it is).

**What to change:** nothing. A host whose reflexes are its people's rows passes `isolate: true` and logs `refused`.
