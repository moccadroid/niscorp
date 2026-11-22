# Owner decisions

The "Start here" decisions from [README.md](README.md), answered by the owner on 2026-11-22. Numbers are README's.

| # | Decision | Answer | Status |
|---|---|---|---|
| 1 | moss P-M1b: the webhook door passes the visitor's session cookie and operator key to the vendor, and serves the vendor's HTML as the app's own page | **Close it**: strip cookie, operator key and proxy credentials; serve vendor replies in a sandbox that cannot use the app's session | built |
| 4 | moss P-M5: the artifact sweep counts downtime as unused | **Opt-in and docs**: document it now; an option counts only time the server was running; default unchanged | built |
| 18 | vex P1: writes can move a row out of the caller's rules, and answer rows the caller may not read | Owner's rule: on by default only if no app but lyceum (and mira, which can be fixed) is affected; any effect on AnimaApp or anima-finance means no. Checked by reading every write of lyceum, AnimaApp, anima-finance and mira against each role's policy: **`checkMovedRows` on by default** (no app sets a column its caller's update rule pins); **`answerReadableRows` opt-in, off** (it breaks sign-in in AnimaApp, anima-finance, mira and lyceum, whose sign-in role has no read grant on its link table, and mira's `friends/accept`) | built |
| 19 | vex P2: moss's `answerIntent` ignores an entry's declared reach | **Fix it**: replay at the entry's reach, like `/api/vex` (vex + moss) | built |
| 21 | vex P5: an unlocked endpoint lets any caller manage fingerprints | **Switch, on by default, with a startup warning**; the README's agent-endpoint example turns it off | built |
| 37 | cortex CTX-P2: a timed-out tool keeps running | **Fix it**: abort the tool's signal at its limit; relay's screen builds past 12 minutes stop | built |
| 45 | tide P-T3: catch-up after a restart | **Opt-in only**: `load(…, { resume: true })`, default unchanged | built (P-T3) |
| 54 | cli P1: `export --out` empties any folder but four | **Do it**: default `out/` emptied as today; an `--out` folder loses only files the previous export wrote | built |

## How they were built

On `review-decide/vex-moss`, `review-decide/cortex` and `review-decide/cli`, each checked by an independent agent, given one fix round, and merged into `review-fix/all-check`. Changes beyond the decisions, for the owner to know:

- **vex/moss**: a moved row is refused with 400 `scope_denied` after one check query; columns a policy `set` rule stamps are not checked; an `onConflict … set` that would move a row leaves it and answers `[]`. moss has `runtime.checkMovedRows` (default on) and `runtime.answerReadableRows` (default off). The sweep option is `runtime.artifactsUnusedSinceStart`: it waits until the server has been up for `artifactsUnusedMs`. The webhook sandbox also applies to proxy replies, where a `fetch` ignores it.
- **cortex**: a tool's `ctx.signal` is now its own per-call signal, so work a tool leaves running after it returns no longer stops when the run is aborted later. No app relies on that; keeping it would grow memory on every tool call (`AbortSignal.any`: 4.2 → 61.5 MB over 50,000 calls).
- **cli**: the default `out/` is today's code unchanged. For a folder named with `--out`: a file at that path and a folder of the user's where the export writes a file are refused; a link given as `--out` is followed; a staging folder a killed run leaves is removed by the next run; `--out OUT` on Windows and macOS is the default folder. The rework after the check was not checked again, and the folder-permission tests only bite on Linux and macOS (CI).
