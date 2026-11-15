---
"@niscorp/charter": patch
---

A string where a charter expects a list (`allow: "crm.deal.view*"`) is read as a list of that one pattern instead of one pattern per character, so it no longer grants every id through a `*`. `verifyCharter` reports keys it does not read (a misspelt `denny` or `Deny`) and such strings as `shape` warnings. Any other value that is not a list of strings no longer crashes the verifier: it grants nothing (a warning), and in `deny` or `without` it is a `shape` error. `*` now matches across line breaks in an id.
