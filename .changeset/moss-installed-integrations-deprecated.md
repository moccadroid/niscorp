---
'@niscorp/moss': patch
---

`installedIntegrations` on the manifest is marked deprecated: the server never called it. Which integrations are live for a principal's tenant is `installed` on the record `identity.resolve` returns.
