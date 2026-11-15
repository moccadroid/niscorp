---
"@niscorp/cli": patch
---

The command's source is made of modules (`command`, `project`, `build`, `serve`, `dev`, `migrate`, `shape`); its commands, exports and built files are the same.
Three printed lines are worded plainly: an own-shell export that writes nothing says `N of M paths failed a check`, the build's legend says `✗  not written: a check failed`, and the build says `public/assets/ has files of your own`. Exit codes and files are the same.
`nisc export` on an app behind moss names a path that could not be drawn on a line of its own, and offers `--allow-live` only for the paths that want a server; with `--allow-live` it says which paths were written as the undrawn template. Exit codes and files are the same.
`nisc migrate` (and `--check`, `--status`) on a runtime that says `migrations: 'apply'` prints first that its database starts empty every time, so what it applies is gone when the command ends. Everything after that line is as before.
`nisc start` with `PORT` set but empty says that it is read as 0, any free port; the port is the same as before.
`nisc start` on an app with its own shell answers an address that does not decode to a path (`/%`, `/%E0%A4%A`, one with `%00`) with a 400 `not a path`, where it answered 500.
`nisc build` on an app behind moss names, after the route table, what its charter does not read as written (a misspelt key such as `denny`), one line each. The exit code is the same.
The README says to add `@niscorp/cli` as a dependency when `nisc start` serves the app, with what `nisc.config.ts` imports.
