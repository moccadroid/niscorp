---
"create-nisc": patch
"@niscorp/nisc": patch
---

A new app's terminal entry is `browserEnv()`, and AGENTS.md rule 12 says where a session is kept: in the browser's own cookie, which no script can read — not in `localStorage`, and not in a cookie copy.

The rule used to tell an app that draws its pages on the server to keep a script-readable copy of the session token in a cookie (`browserEnv({ cookie: true })`) and to have every sign-in handoff store that copy too. moss now keeps the session itself, where the page cannot reach it, so the rule says the opposite: nothing in an app stores a token, and a sign-in the app answers over HTTP sets the session cookie on its response (`sessionCookies(request, token)`) and hands the page nothing. D5 and check 6d follow.

**What to change:** nothing in an app that exists — `browserEnv({ cookie: true })` still compiles, and the option does nothing now.
