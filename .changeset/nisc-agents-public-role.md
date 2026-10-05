---
"@niscorp/nisc": patch
---

`AGENTS.md` rule 10 says every charter defines a role named `public`. It is what a request with no session, and a signed-in principal with no assignment, resolve to; the name is fixed, and `public: []` grants nothing. Boot does not check for it: without it those requests fail with `Unknown role "public"`.

**What to change:** nothing, for a charter that has the role.
