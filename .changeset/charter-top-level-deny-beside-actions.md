---
"@niscorp/charter": patch
---

BREAKING (pending consolidation): nothing unless a host resolves, without `verifyCharter`, a role that has both an `actions:` section and a top-level `deny`, and relied on that `deny` being dropped.

A role with both an `actions:` section and a top-level `deny` (`{ actions: ['crm.*'], deny: ['crm.deal.delete'] }`) now takes away what the top-level `deny` names when it is resolved, instead of granting the whole section. The top-level `allow` beside an `actions:` section still grants nothing. `verifyCharter` refuses such a role as before (`ambiguous-selection`), so under moss nothing changes.
