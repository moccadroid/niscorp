---
"@niscorp/vex": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: an app whose update writes a column a `match` rule pins (handing a row over, e.g. setting `owner_id` under an `owner_id = me` rule) sets `mutations: { …, checkMovedRows: false }` to keep today's behaviour.

An update can no longer move a row out of the caller's own update rules: when it writes a column a `match` rule pins (say `project_id` under `match: 'project_id', in: 'projectIds'`) to a value that rule does not allow, it is refused with 400 `scope_denied` naming the rule and the column, and nothing is written. An insert's `onConflict … set` that would move the existing row out does not move it and answers `[]` for it, not 400. A setup that hands rows over this way (setting `owner_id` under an `owner_id = me` rule) keeps today's behaviour with `mutations: { …, checkMovedRows: false }`.
