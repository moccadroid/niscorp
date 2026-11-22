---
"@niscorp/prism": patch
---

BREAKING (pending consolidation): nothing unless an app relied on the second and later calls of one config object losing a constant's `__proto__` key; they now answer as the first call does.

A `$const` whose value has a key `__proto__` keeps it as an own key on every call of a config object that is run again. From the second call (when the config's tree is kept and its constants handed out as copies), the key used to be dropped and its value became the copy's prototype, so `out.admin` read `true` through it.
