# Owner decisions

The "Start here" decisions from [README.md](README.md), answered by the owner on 2026-11-22. Numbers are README's.

| # | Decision | Answer | Status |
|---|---|---|---|
| 1 | moss P-M1b: the webhook door passes the visitor's session cookie and operator key to the vendor, and serves the vendor's HTML as the app's own page | **Close it**: strip cookie, operator key and proxy credentials; serve vendor replies in a sandbox that cannot use the app's session | to build |
| 4 | moss P-M5: the artifact sweep counts downtime as unused | **Opt-in and docs**: document it now; an option counts only time the server was running; default unchanged | to build |
| 18 | vex P1: writes can move a row out of the caller's rules, and answer rows the caller may not read | Owner's rule: on by default only if no app but lyceum (and mira, which can be fixed) is affected; any effect on AnimaApp or anima-finance means no. Checked by reading every write of lyceum, AnimaApp, anima-finance and mira against each role's policy: **`checkMovedRows` on by default** (no app sets a column its caller's update rule pins); **`answerReadableRows` opt-in, off** (it breaks sign-in in AnimaApp, anima-finance, mira and lyceum, whose sign-in role has no read grant on its link table, and mira's `friends/accept`) | to build |
| 19 | vex P2: moss's `answerIntent` ignores an entry's declared reach | **Fix it**: replay at the entry's reach, like `/api/vex` (vex + moss) | to build |
| 21 | vex P5: an unlocked endpoint lets any caller manage fingerprints | **Switch, on by default, with a startup warning**; the README's agent-endpoint example turns it off | to build |
| 37 | cortex CTX-P2: a timed-out tool keeps running | **Fix it**: abort the tool's signal at its limit; relay's screen builds past 12 minutes stop | to build |
| 45 | tide P-T3: catch-up after a restart | **Opt-in only**: `load(…, { resume: true })`, default unchanged | built (P-T3) |
| 54 | cli P1: `export --out` empties any folder but four | **Do it**: default `out/` emptied as today; an `--out` folder loses only files the previous export wrote | to build |
