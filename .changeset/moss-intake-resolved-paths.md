---
'@niscorp/moss': patch
---

Integration intake holds an endpoint's URL to where it is routed. A path under `/integrations/<id>/` is refused when it resolves anywhere else (`..`, `.`, `%2e`, `\`) or holds a `{{…}}` template before its `?`, and a call to the app is refused unless it is one of the app's vex routes (`/api/vex`, `/api/<resource>/vex`).

Before, intake read only the start of the URL as written, while the in-process wire resolves it before routing: an approved integration could reach another integration's proxy, or any route of the app, as the signed-in person. An integration whose bundle has such an endpoint is refused, with a sentence for each, when it is next registered; one imported before this release keeps the endpoints it was imported with until then.
