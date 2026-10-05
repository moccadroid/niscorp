---
"@niscorp/strata": patch
---

The `WRONG_OWNER` refusal from `createUpgrader` says what to do when the sequence is a grammar: declare its `documents`.

strata tells a grammar from a table sequence by what the sequence declares: `documents`, or a document step. A kit that declares neither and has no migrations yet — or only empty markers, the migration an addition to a grammar is recorded with — reads as owning tables, and `createUpgrader` refuses it. The refusal named one way out, `migrate`, which for a kit is the wrong one: it records the kit's markers in a database's ledger.

Which sequences are refused has not changed, and neither has how a sequence is read. The message has a second sentence:

- before: ``Documents are upgraded by grammar sequences; these own tables and belong to a database's ledger (`migrate`).``
- now: ``Documents are upgraded by grammar sequences; these own tables and belong to a database's ledger (`migrate`). If one of them is a grammar, declare its `documents` — a sequence with no `documents` and no document step is read as owning tables.``

The README states the rule, and its kit example declares `documents: {}`.

**What to change:** nothing in an app. Code or a stored expectation that compares this error's full message text needs the new text; `code` (`WRONG_OWNER`) and `details` are as they were.
