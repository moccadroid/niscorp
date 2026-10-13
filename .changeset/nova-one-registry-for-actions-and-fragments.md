---
'@niscorp/nova': minor
'@niscorp/moss': patch
'@niscorp/nisc': patch
'@niscorp/cli': patch
---

A nova shell keeps actions and fragments in one registry. **Breaking.**

BREAKING — approved by moccadroid, 2026-10-13: `shell.registerFragment` is gone, and an action and a fragment no longer share an id.

- **`shell.registerAction(definition)` takes an action or a fragment**, told apart by the fragment's `kind: 'fragment'`, and **`shell.removeAction(id)` takes either out**. There was no call to take a fragment out. Taken out, a fragment is unknown to a later `with: [...]`; an instance that was opened with it keeps the definition it was composed into, and `back` skips a position that was opened with it, as it skips one it cannot put back.
- **A fragment handed to `createShell` is validated**, as an action is: one that does not parse throws `DefinitionValidationError` at construction. Only `registerFragment` validated one before.
- **An id names an action or a fragment, never both.** `createShell` and `registerAction` throw `DefinitionValidationError` for an id that is already the other kind's.
- Opening a fragment by itself still throws `UnknownActionError`, and a `with: [...]` that names an action still throws `UnknownFragmentError`. `ShellConfig` keeps `actions` and `fragments`.
- **Moss:** a fragment that is no longer answered for a principal is taken out of their open shell, as an action is. A boot, and a set of actions handed over, refuse an action under the id of a fragment a shell ships. On a session's own shell, `registerAction` (refused there as before) is the one call that would take a fragment.

**What to change:** `shell.registerFragment(fragment)` becomes `shell.registerAction(fragment)`. Give an action and a fragment that share an id two ids.
