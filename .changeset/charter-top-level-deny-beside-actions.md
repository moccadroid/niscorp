---
"@niscorp/charter": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: nothing unless a host resolves, without `verifyCharter`, a role that has both an `actions:` section and a top-level `deny`, and relied on that `deny` being dropped.

A role with both an `actions:` section and a top-level `deny` (`{ actions: ['crm.*'], deny: ['crm.deal.delete'] }`) now takes away what the top-level `deny` names when it is resolved, instead of granting the whole section, and a role that extends it (`c: { extends: ['p'] }`) no longer gets `crm.deal.delete` from it either. The top-level `allow` beside an `actions:` section still grants nothing. `verifyCharter` refuses such a role as before (`ambiguous-selection`), so under moss nothing changes; it now also checks that top-level `deny` like any other, so a charter already refused can report more lines for it: `dead-deny` when it matches nothing (`{ r: { actions: ['crm.*'], deny: ['hr.nothing'] } }`), `orphan` for an action it leaves no role granting, and a re-allow warning for a child that grants back what it takes away.
