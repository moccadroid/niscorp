---
'@niscorp/cli': patch
'@niscorp/nisc': patch
---

`nisc start` checks the app's functions after the project's `routes` and the site are mounted.

Checking the functions answers requests in-process, and the server takes no route once it has answered one. An app with functions whose first screen reads as it mounts failed to start: `Can not add a route since the matcher is already built.`
