---
"@niscorp/vex": patch
"@niscorp/moss": patch
"@niscorp/nisc": patch
---

A Postgres view can now be read as an entity, read only, where it is listed by name: vex's `config.views` (and `adapter.introspect({ views })`), and moss's `defineApp({ views })`. A listed view has its columns and `view: { reads }`, the tables under it; every write to it is refused; a reactive read of it is answered again when a table under it is written; and in moss it is `<view>.read` in the charter's `data` universe and nothing else. The boot refuses a listed name that is not a view, and a listed view over anything but the tables vex reads (a table of another schema, a materialized view, a sequence, a function the app wrote); it says where a role is granted a view over a table it is not granted, or over a table it reads under row rules the view has none of. `nisc migrate` reads the listed views, so dropping one is a removal. With no views listed, introspection, the universe and the schema fingerprint are exactly what they were.
