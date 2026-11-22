---
"@niscorp/cli": patch
---

BREAKING (pending consolidation): nothing, unless an app's `allow.style` names a file only because of a `<const>` assertion — that allowance now fails as allowing nothing; delete it.

The shape check (`@niscorp/cli/shape`) also asks the compiler what each name refers to, and prints an `[info]` line — file, line and rule — for a reach its rules miss because it is spelt another way: `const { roles } = session`, `const { NumberFormat } = Intl`, `new globalThis.Intl.DateTimeFormat()`, `const { pathname } = window.location`, `window['document'].querySelector(…)`, and a function of `src/app/` reached through a namespace import, a re-export or a dynamic import. A name read only as a type (`import type`, `typeof`, `export type`) is not reported. Such a line is left out when a rule already fails the same name in that file, or when `allow` names that file for that rule. The exit code is unchanged: these spellings are reported, not failed, and the README now says which spellings fail. `<const>[...]` passes rule 16, as `as const` does.
