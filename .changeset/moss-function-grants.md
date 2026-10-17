---
'@niscorp/moss': minor
'@niscorp/charter': patch
'@niscorp/nisc': minor
'@niscorp/cli': minor
---

The charter decides which of an app's functions a principal may call. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-14: give every role of the charter a `functions` part, the functions its actions call, or `functions: ['*']` to keep calling all of them; a role written as a list (`member: ['home', 'settings']`) becomes `member: { actions: ['home', 'settings'], functions: [...] }`.

- **A shell holds only the functions its principal's roles grant** (`functions`, beside `actions`, `data` and `layouts`, with the same globs, `extends` and `deny`). A role with no `functions` may call none. Before, every shell held every function. A living shell follows the roles an adopt answers, as its actions do.
- **The boot is refused, with the list of what to grant**, where a role on its own, a combination people wear, or `public` holds an action (or the shells ship a fragment) that calls a function its grants miss: `"member" hold "chrome.topbar", which calls "auth.leave": their functions do not grant it`. A name with a template in it is decided when it is called.
- **`'*'` is said at boot**: `role "member" allows every function ('*'): the generated actions of the people who hold it, or a role that extends it, may call any it does not deny`.
- **The charter's checks over the functions run in `server.checkFunctions()`**, which builds nobody's shell once and reads what its `functions(session)` returned. A deny that matches nothing refuses; a grant that names no function, and a function no role grants, are said.
- **A generated action or fragment may call a function its owner's roles grant**, named written out; one they do not grant is refused when it is saved and left out when a shell is built. `session.functions()` lists the functions a session may call, `{ id, description? }`, for the model that writes one.
- `@niscorp/charter` has the `functions` section, and `verifyCharter` checks it where a `functions` universe is handed in.

For whoever upgrades an app, person or agent: boot it. The refusal lists, per role combination, each function an action calls that the charter does not grant. Add those names to the `functions` of the role that holds the action, or `['*']` to the roles whose people may call everything. This is the app's permissions table: write it deliberately, and do not generate it.
