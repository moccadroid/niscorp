---
"@niscorp/cli": patch
---

The command's source is made of modules (`command`, `project`, `build`, `serve`, `dev`, `migrate`, `shape`); its commands, exports and built files are the same.
Three printed lines are worded plainly: an own-shell export that writes nothing says `N of M paths failed a check`, the build's legend says `✗  not written: a check failed`, and the build says `public/assets/ has files of your own`. Exit codes and files are the same.
