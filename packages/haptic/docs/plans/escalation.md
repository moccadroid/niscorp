# Escalation: low first, high when it fails, rendering when the page says so

Status: design for the pilot, not built. Evidence: rounds G and J (17 pages × 3, Read at low), round K (six pages × 3, Read at high), offline checks `findings-vs-outcome.mjs`, `decoy-check.mjs`, `render-check.mjs` in `data/pilot/bench17/`.

## The ladder

1. **Fetch.** If any page of a level shows the render signal (below), every page of that level is rendered with jsdom before anything reads it.
2. **Discovery at low effort** (Read, field rules and mapping at low).
3. **If it stopped, or ended with any finding other than "N items, the reader counted M", discovery runs again from the start at high effort** (Read, field rules and mapping at high): new conversations, nothing carried over. The count finding stays in the report but does not escalate: it is the reader's own guess (in rounds G and J it was the only finding on 7 runs, all complete), while the others are code checking the result against what the reader cited.
4. **The first attempt stands unless the second is strictly better**, ranked: ready before stopped; then fewer missing or lost cited examples; then fewer other findings (count excluded). A tie keeps the first. Both attempts are kept with their tokens and time.

## When a page is rendered

**Signal:** some link address is shared by at least 3 links with 3 different texts. SQLite ships every download link as `hp1.html` (15 texts) and a page script sets the real addresses. The signal is the plain definition of a decoy; no cut-off is tuned to SQLite. It also fires on Adafruit, both Django pages, Lua, PythonAnywhere and Ruby, which repeat ordinary links. Rendering leaves their text views identical line by line (`render-diff.mjs`); it costs about 0.6–0.7 s per page (the 600 ms wait for timers plus jsdom), at discovery and on every run of the artifact. Always rendering was considered and not chosen: it would add that to every page and run page scripts on every live page.

**Rendering:** jsdom runs the page's own inline scripts with no network and no external files, waits 600 ms for timers, and the rendered HTML replaces the source's body for everything after it: the text view, the rules and Haptic's selection. The stage records `render: true`, so a run of the artifact renders the same pages.

jsdom is not a security sandbox; in the pilot it only ever sees saved captures. In the package, rendering runs in its own worker with no network and no file access before it sees live pages.

## What the evidence says it should do

- Rounds G and J (51 + 51 runs at low): 22 not complete. 10 stopped and 4 had label or example findings → escalated. 6 are SQLite, which the render signal handles before step 2. 2 are zlib partials with no finding (the permalink judgement): not reached.
- The 7 complete runs whose only finding was the count (Lua every time: four links to one address; Debian once) do not escalate.
- Not built: a third attempt with every page rendered. Nothing in the evidence needs it: the one page that needs rendering is caught by the signal.
- Round K: at high, the six hardest pages lost 1 of 18 runs to Read, against 9 of 36 at low.

## Result: round L (2026-11-07, built as above, 17 pages × 3, `data/pilot/bench17-runsL`)

| 17 pages × 3 | Low only (G + J) | Ladder (L) |
|---|---|---|
| Complete | 80 of 102 (78%) | **49 of 51 (96%)** |
| Escalated | — | 8 of 51; the second attempt was chosen in 7 |
| Median seconds | 2–5 | 2.2 clean, 22 escalated |
| Input tokens per run | about 15k | about 18k (928k in all) |

- SQLite 3 of 3: the decoy signal rendered the page, and the real download links reached Read.
- Escalated and rescued: 7-Zip ×3 (the low mapping kept older release rows every time), Django linked posts ×3 (all stopped at low), Debian once (extra rows).
- Not complete: SQLite release notes run 2 (stopped at low and at high: "record rule: no candidates"), zlib run 3 (3 of 4, the permalink judgement, no finding to escalate on).
- Same 17 pages the pilot was tuned on; a held-out set is still owed.

## Costs

- Clean runs: unchanged, 2–5 s. Escalated runs: plus one high attempt, about 6–18 s and 15–20k input tokens.
- Undetectable wrong answers (valid but wrong, like GitHub's "?" status) are not escalated.
- New: the pilot imports jsdom (already in the workspace store, 25.0.1); the package will need it as a dependency.
