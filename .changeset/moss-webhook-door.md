---
"@niscorp/moss": minor
---

BREAKING — approved by moccadroid (owner), 2026-11-22: an integration that read the visitor's `cookie`, `proxy-authorization` or `x-operator-key` at its hook, or a vendor page served through the webhook or proxy that used the app's session or browser storage, carries what it needs in the request itself.

The webhook door no longer passes the visitor's `cookie`, `proxy-authorization` or `x-operator-key` on to the integration, and what an integration answers through the webhook or the proxy is served with `x-content-type-options: nosniff` and a `content-security-policy` sandbox: a vendor's page still runs its script, submits its forms and navigates, but never as the app's own page. A vendor that read the app's cookie at its hook, or a landing page that used the app's browser storage, no longer can.
