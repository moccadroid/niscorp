---
'@niscorp/moss': patch
---

`mountSite` answers a missing file with 404. A name with an extension that is neither a file in `dist` nor a page of the manifest used to fall through to the catch-all and come back as the drawn page with a 200 — so a browser holding a page from before a deploy asked for its old script and was handed a document. A page whose own path has a dot in it (`/docs/v1.2`) is still that page.
