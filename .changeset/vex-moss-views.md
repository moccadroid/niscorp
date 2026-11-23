---
"@niscorp/vex": patch
"@niscorp/moss": patch
"@niscorp/nisc": patch
---

A Postgres view can now be read as an entity, read only, where it is listed by name: vex's `config.views` (and `adapter.introspect({ views })`), and moss's `defineApp({ views })`. A listed view has its columns and `view: { reads, outside? }`: the tables under it, and what else it uses that vex does not follow; every write to it is refused; a reactive read of it is answered again when a table under it is written; and in moss it is `<view>.read` in the charter's `data` universe and nothing else. The boot refuses a listed name that is not a view, and a listed view that uses anything but the tables vex reads and Postgres's own functions (a table of another schema or of Postgres's catalog, a materialized view, a sequence, a function the app wrote or an extension's); `viewExtensions` (vex config, `defineApp`) lists the extensions whose functions a view may use; it says where a role is granted a view over a table it is not granted, or over a table it reads under row rules the view has none of. `nisc migrate` reads the listed views, so dropping one is a removal. With no views listed, introspection, the universe and the schema fingerprint are exactly what they were.
