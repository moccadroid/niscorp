---
'@niscorp/moss': minor
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

`server.checkFunctions()` reads the app's functions and refuses what is wrong with them before anyone is served.

An app's functions are known only once a session is: `functions(session)` is called for each shell, and a session hook may reach for the server object, which the app holds only once `createServer` has answered. So the check is the app's to call, once it holds the server and before it listens; `serve` of `@niscorp/moss/node` calls it, and so do `nisc dev`, `nisc build`, `nisc check` and `nisc start` after the project's `boot`; each closes what it built where it refuses. It builds nobody's shell once, after everything is in force, and drops it. What that call returned is checked, and it refuses on:

- **an action, or a fragment a shell ships, that calls a function the app does not have**: `"home" calls "auth.leave", which the app has no function of`. Before, the call failed when a person pressed the button. An app with no `functions` has none. A set of actions handed over while the app runs is held to the same at that refresh.
- **a charter `functions` deny that matches nothing**: `Charter is incoherent over the app’s functions — refusing to serve:`.
- **two functions under one id**: `moss: functions(session) returned "auth.leave" twice.`

What the charter only warns of (a grant that names no function, a function no role grants), the functions with no description, and a map of handlers are said at that point, once.

The cost is one anonymous shell built, as any visitor who is not signed in causes. Every check reads nobody's functions: an app that hands a function only to signed-in sessions is refused where an action calls it.
