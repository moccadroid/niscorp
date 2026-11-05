# Per-attempt model budgets and one fresh timetable discovery

The user explicitly corrected the shared-pool behavior: a review-driven new attempt needs a fresh model allowance, rather than whatever the first attempt left unused. This supersedes the cross-attempt budget policy in the earlier reviewer-feedback measurement; its original evidence remains unchanged.

## Budget correction

Two production JSON files changed. In `discovery.json`, the bounded repair transition now initializes author and reviewer step/time counters from the immutable profile. The transition no longer requires leftover author allowance. Phase changes and local mechanical/schema retries still spend the current attempt's pool; they cannot renew it. The existing `repairCount < maxRepairs` check remains.

Defaults are 12 author steps/300 seconds and four reviewer steps/60 seconds **per attempt**, with one correction attempt. Histories, original request, caller schema, permissions, page/resource charges and owned captures carry forward. `author.attempt` identifies the allowance reported by `author.remaining`.

The default whole-run engine cap in `default-profile.json` is now 780 seconds: two default model attempts plus a 30-second final trial fit within 750 seconds, with 30 seconds of margin. This is a global ceiling, not a promise under arbitrarily slow HTTP. Explicit tighter host caps and caller cancellation remain authoritative. The engine implementation, model adapter, prompts, readers and dependencies did not change.

## Offline checks

Typecheck and the full offline suite pass. Evidence: `data/runs/attempt-budgets-2026-11-02/`, including `focused.log` and `check.log`.

Focused checks prove a correction starts after the first author pool is completely exhausted; author time and calls renew together; the reviewer receives a fresh pool; zero repairs prevents renewal; local retries do not renew; one-page/one-resource ceilings and own-job history survive; invalid corrections retain the preceding working artifact. An obsolete fake-review queue in the first focused invocation lacked the now-correct second review response; the queue was updated, and focused/full checks pass.

One focused correctness re-review graded the change 9/10 with no material finding. The reviewer independently used a 1,000 ms whole-run deadline: after the first attempt exhausted three author steps, the next author received three fresh steps, but the original host deadline stopped the delayed operation at approximately 1,011 ms without publication. No broad reviewer rerun was performed for this small correction.

The required HTTP-only PDF regression passes with one 116,547-byte PDF, zero model calls. All 11 engine files and the model adapter match this slice's initial hashes.

## Fresh requested discovery: exact outcome

Evidence: `data/runs/live-animafabrik-attempt-budgets-2026-11-02/`.

The input is byte-identical to the prior live run: `https://animafabrik.com`, instruction `Give me the timetable of animafabrik.com.`, following enabled, depth 2, max pages 5 and resources disabled. No prior sources, answers, selectors, output schema or mapping were supplied. All initial acquisition, final mechanical verification and independent execution used fresh HTTP. Raw provider bodies, source captures and frozen source/profile/package/input snapshots are preserved. No manual correction or additional paid attempt followed.

**A working artifact was returned and executed. Its output is useful but imperfect.** The caller receives the unchanged 21-record output, not a manually filtered 19-record result.

| Measurement | Result |
| --- | ---: |
| Returned records | 21 |
| Source class records with matching core fields | 19/19 |
| Unrelated contact records included | 2 |
| Classes whose source notes were omitted | 3 |
| Provider requests | 9 |
| Input / output tokens | 145,649 / 22,345 |
| Discovery time | 63.892 s |
| Total time | 64.446 s |
| Independent artifact preparation | 58.997 ms |
| Independent execution including two HTTP requests | 126.927 ms |
| Rate-limit waits / execution AI calls | 0 / 0 |

All nine provider responses reported usage. Six website HTTP requests cover initial acquisition, final verification and independent execution. Frozen files remained unchanged.

The automatically chosen shape is `{day,title,description,rating?}`. Time and class name remain together in title; teacher and duration remain together in description. Rating strings retain native whitespace. Unlike the preceding artifact, this schema has no per-class options field.

Independent grading reads each fresh run's own HTML and is not supplied to discovery. All 19 class day/title/description/rating values match the source after whitespace normalization. The two extra records are `ANIMA FABRIK / 💌 / office@animafabrik.com` and `ANIMA FABRIK / 📍 / Längenfeldgasse 27`. The latter also uses the location text as its rating. These are footer contacts, not classes.

Missing source notes:

- Monday ADC 1 Rehearsals: `→ about rehearsals`.
- Thursday Beginner Course: `included with membership`, `not included with trial`, `→ book course`.
- Friday Modern Graham: `🔸 13 Nov SUB by Andrea Rachele`.

The source changed from the preceding run: the fresh timetable response is 142,447 bytes, rather than 142,668 bytes, and contains the November substitution note. Older captured values were not substituted into this evaluation.

The reviewer **accepted** the output despite those extras and omissions. This is a false semantic acceptance. `repair.attempts` is zero and `author.attempt` is one; no fresh-budget transition occurred in this live run. The budget fix is covered by the focused offline tests, not by a real rejection in this run. The successful mechanical checks do not establish a clean or complete timetable answer.

The raw result remains returned for the caller to use or reject, as requested. No synthetic changed/added/empty-source tests were run as part of this new live result, and no previous run was regraded. The earlier successful 19-record run remains a success; this is a separate fresh run with different model-authored rules and an imperfect output.
