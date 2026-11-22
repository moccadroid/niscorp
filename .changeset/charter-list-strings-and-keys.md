---
"@niscorp/charter": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: a charter that writes a string where a list belongs (`allow: "crm.deal.view*"`) and relied on it granting every id writes the patterns it means as a list.

A string where a charter expects a list (`allow: "crm.deal.view*"`) is read as a list of that one pattern instead of one pattern per character, so it no longer grants every id through a `*`. `verifyCharter` reports keys it does not read (a misspelt `denny` or `Deny`) and such strings as `shape` warnings. Any other value that is not a list of strings no longer crashes the verifier: it grants nothing (a warning), and in `deny` or `without`, or as a whole role that is `null`, it is a `shape` error. A `scoping` that is not a string is still handed on as written, so the role reaches no rows, and is now a `shape` warning. `*` now matches across line breaks in an id.
