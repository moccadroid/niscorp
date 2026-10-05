---
"@niscorp/moss": patch
---

The docs say a charter defines a role named `public`. A request with no session, and a signed-in principal with no assignment, resolve to that role, and the name is fixed. A charter without it still boots and nothing is said; those requests then fail with `Unknown role "public"` (a 500, a socket closed `4500`, a page served undrawn). `public: []` grants nothing. README, DOCS and DESIGN now say so, and a test holds it. No code changed.

**What to change:** nothing, for a charter that has the role. One that names its visitor role something else adds `public` beside it.
