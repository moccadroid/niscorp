# Saved artifacts first, then fresh discovery — 2026-11-03

## Scope and ownership

Latest saved Animafabrik, Guardian and Spiegel artifacts ran against live HTTP first. They were not selected by their outcome: Animafabrik is the latest saved 21-record artifact, not the older cleaner 19-record one. No credentials or model operations were loaded for those executions. Only after all three completed did one fresh discovery run per unchanged original request start, using the frozen current shipped profile and code. No old answers, rules or schemas were supplied to fresh discovery. Each published new artifact ran again against fresh HTTP without AI. There were no production edits, saved-page substitutions, manual corrections or extra paid repeats.

Original source hashes and saved artifact hashes are retained. `final-report.json`, `cases.json` and `batch-frozen.json` identify exact provenance and scope. Current source matches the frozen source byte-for-byte; original artifact bytes also remain unchanged.

## Actual results

| Site        | Saved artifact on live page                                                                                 | Fresh discovery, then live execution                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Animafabrik | 19/19 class identities, descriptions and levels; two unrelated contact rows; notes missing for four classes | 19/19 identities, descriptions and levels; no unrelated records; same four classes have missing notes  |
| Guardian    | 10 supported distinct headline/link pairs; 9 descriptions                                                   | 10 supported distinct headline/link pairs; 9 descriptions                                              |
| Spiegel     | 10 supported distinct headline/link pairs; 3 descriptions                                                   | No artifact: first task-declaration response fails at provider stream parsing, before HTTP acquisition |

Both timetable outputs omit the source's Tuesday 19:45 Ballet `3 Nov no class` cancellation and Friday Modern Graham `13 Nov SUB by Andrea Rachele` note. Monday rehearsals and Thursday beginner-course notes are also absent. These are preserved limitations, not a complete timetable certification. The independent checker reads original current HTML and uses no model verdict as its oracle. News association establishes source support, not universal importance ordering.

## Time and model usage

| Site        | Saved artifact execution, including HTTP | Saved preparation | Fresh discovery + verification + independent execution | Model requests | Reported input / output tokens | New artifact execution, including HTTP | New preparation |
| ----------- | ---------------------------------------: | ----------------: | -----------------------------------------------------: | -------------: | -----------------------------: | -------------------------------------: | --------------: |
| Animafabrik |                               399.411 ms |        110.031 ms |                                               79.096 s |              9 |                 117777 / 27629 |                            2917.552 ms |       65.523 ms |
| Guardian    |                               367.913 ms |         95.104 ms |                                               50.903 s |              7 |                 277894 / 15481 |                             291.881 ms |       64.376 ms |
| Spiegel     |                               504.888 ms |         85.053 ms |                                        2.950 s, failed |              1 |      unavailable / unavailable |                            unavailable |     unavailable |

Fresh model total: 17 requests, 395671 reported input and 43110 reported output tokens; 16 responses report usage. The failed Spiegel response does not supply usage; it is not a measured zero-token call. Batch wall time is 135.583 s including child startup. Actual rate-limit waits and all artifact execution model calls are zero.

The new timetable artifact's 2.918-second execution includes 2.899 seconds in its two HTTP calls. Its residual measured execution work is about 18 ms; preparation is separate. The execution-time increase versus the saved artifact is dominated by transport latency, not a new interpreter change.

## Failures and interpretation

Spiegel's saved artifact succeeds, while fresh discovery fails on its first task job. The provider returns HTTP 200 streaming data and then an in-stream error: `Parsing failed. The model generated output that could not be parsed. Please adjust your prompt. See failed_generation for more details.` The ordinary library surfaces it as `model_call_failed`; the task stops without fetching the site. It is neither a website failure nor a demonstrated new extraction regression. No prompt edit or hidden extra attempt followed.

Fresh Animafabrik removes the two footer records but still omits operational notes; its reviewer accepts the result and no semantic repair runs. Guardian's quality is unchanged in this comparison. All three existing artifacts remain mechanically reusable on the tested current pages; this does not guarantee future structural reuse or completeness.

Evidence: `data/runs/replay-then-discovery-three-2026-11-03/`, including exact requests/responses, original HTTP captures, old/new raw data, independent associations, generated schemas, artifacts, review metadata and frozen code. Read old and fresh results as separate live runs; no captured page was substituted into either.
