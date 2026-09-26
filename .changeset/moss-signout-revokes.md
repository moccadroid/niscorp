---
"@niscorp/moss": patch
"@niscorp/nisc": patch
---

Sign-out revokes the credential. Under `runtime.session: 'sessions'`, `session.revoke()` now deletes every session the principal holds before closing its terminals — before, it closed the terminals and disposed the shell but left the rows, so a copied token signed straight back in until it expired. `revoke()` returns a promise that settles when the credential is gone; callers that ignore it are unaffected.
