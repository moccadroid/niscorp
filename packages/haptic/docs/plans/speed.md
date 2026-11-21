# Haptic: faster discovery at 23/33

Status: built and measured 2026-11-12 (results at the end); the proposal was reviewed twice (NO, then NO on one gate) and corrected. All of it is uncommitted on branch `haptic-efficiency` at 6dc66ec0. Numbers come from the live rounds `data/bench/eff-heldout`, `eff-tuned` (and today's earlier `core-*`), or from replaying their saved model answers with no model call. Scripts in `data/compare/harness/`: `time-split.mjs`, `first-only.mts`, `same-result.mts`, `list-profile.mts`. PyPI is left out of the held-out figures, as in the grade. "Code time" means time with no model call.

## The benchmark

Held-out, 11 sites × 3, graded one-to-one: **23/33 complete stays the floor.** Tuned: ≥ 47/51. Today on this branch: held-out median 20.2 s, mean 25.5 s; tuned median 4.4 s, mean 9.6 s. Crawl4AI's held-out median is 5 s, ScrapeGraphAI's 3 s.

## Where the time goes

Held-out, seconds per discovery, averaged over all 33 (each gap between two events is charged to the part that ended it):

| Part | First attempt | Second attempt |
|---|---|---|
| Read (120b) | 2.4 | 7.0 |
| Mapping agent (120b) | 1.2 | 6.7 |
| List choice (code) | 5.0 | 0.2 |
| Rendering | 0.8 | 0.4 |
| Field rules, Jev, other | 0.6 | 0.3 |
| The trial (render and run the artifact) | 0.8 | |

Second attempts are 57% of the time, the list choice in code 20%. Only 13 of 33 discoveries make a second attempt; per second attempt, Read takes 17.7 s.

**What the second attempts buy.** Replaying every discovery with only its first attempt gives held-out 17/33 instead of 23/33, tuned 41/51 instead of 49/51.
- Held-out, 5 after a first attempt that stopped (22 s each on average), all 5 rescued: Read failed twice (Go run 2, HAProxy run 1), the mapping agent found no valid program once (HAProxy run 2), code found no field rules twice (USENIX runs 1 and 3).
- Held-out, 8 after a ready first attempt that disagreed with Jev's labels (47 s each on average: jQuery UI 84 s twice, Wikipedia 41–72 s three times), 1 rescued (PostgreSQL run 3).
- Tuned: 9 second attempts, 8 rescued.

## Change 1: two code paths in the rule finder that grow with the page

Both give exactly the same output. Every saved attempt of all four rounds (228) was replayed through the committed code and the changed code: status, artifact, data and findings are identical in all 228.

**a. Field rules once per set of example records.** Today the field rules are computed for every candidate record rule: 1,297 candidates on Fly's pricing page, 13.7 s of its 14.9 s list choice. They depend only on the records that hold the cited examples (the function reads the page, those records and the examples, nothing else), and most candidates find the same ones: Fly's 1,297 have 17 distinct sets, TypeScript's 242 have 8. The change computes them once per set.

**b. The nesting test walks up from each record.** A candidate rule is dropped when one of its records contains another. Today that is tested for every pair of matched records with a subtree search, so it grows with the square of the page's rows: curl's release table spends 29.5 s there with 12 candidates. The change puts the matched records in a set and walks up each record's parents once. The same question, answered in time that grows with the rows.

**Most of this undoes a cost added in the last commit.** The anchored rules (efficiency change 1) added candidates: in the live rounds Fly's list choice went from 12.7–13.8 s (`core-heldout`) to 26.7–28.7 s (`eff-heldout`), TypeScript's from 7.4–9.9 s to 10.9–17.9 s. Curl's and SQLite release notes' cost (b) was already there before.

**Measured code time per discovery (replay, this branch's round):**

| Site | Today | Changed |
|---|---|---|
| Fly (held-out) | 18 s | 4 s |
| TypeScript blog (held-out) | 8 s | 0.7 s |
| DigitalOcean (held-out) | 3.7 s | 0.1 s |
| curl (tuned) | 34 s | 0.1 s |
| SQLite release notes (tuned) | 15 s | 0.1 s |
| other sites | −0 to −1.3 s | |

Live times run up to 1.8× the replay's on these pages (Fly's live list choice took about 28 s against 15 s replayed), so the live saving may be larger. **Estimates from subtracting the replay savings from the live times:** held-out mean 25.5 s → 22.8 s, median 20.2 s → about 14 s (rough: the middle runs sit at 13, 14 and 17 s, so one run moves it); tuned mean 9.6 s → 6.6 s, median 4.4 s → 3.8 s. Tokens and outcomes are unchanged by construction.

## Change 2: the second attempt at medium effort, measured first

**Today.** The effort ladder is `['low', 'high']` (profile `efforts`). A second attempt at high takes 22 s after a stop and 47 s after a label disagreement.

**The change.** The ladder becomes `['low', 'medium']` if medium rescues as many runs as high. Medium is already a valid effort; no discovery code changes.

**Unknown until measured:** how much faster medium is on Groq's gpt-oss-120b, and whether it rescues the same runs. High was measured (round K, 2026-11-07, rescued failed Reads that low could not); medium never was.

**The measurement, paired.** A second attempt does not depend on the first (every attempt gets the same request), and `discover` already takes model calls per attempt. So the bench can replay each saved escalated discovery's first attempt from its saved answers and run only the second attempt live at medium: the 13 held-out and 9 tuned escalations of this branch's rounds. Their second attempts at high cost 0.48M input tokens; two passes at medium cost about 1M (medium can take more steps than high, so this is not a ceiling). This compares medium with high on the same first attempts, without the ±1–2 completes a whole round swings by. A bench option for it (`--second-effort=medium --from=<round>`) is the only code; it lives in `benchmarks/`.
- **Kept if, in each pass,** the escalated discoveries grade as well as with high: held-out 8 of 13 complete (the 6 rescues plus Node.js runs 2 and 3, already complete after their first attempt; so 23/33 overall), tuned 8 of 9 (so 49/51); no run that was complete with high is incomplete with medium; and the mean second attempt is faster than high's (held-out 37.5 s, tuned 15.7 s). The tuned bar is deliberately stricter than the tuned floor of 47/51: on the same first attempts, medium should lose nothing high kept.
- **Then** the profile default changes, and both sets run live once on the final code against the benchmark. **Otherwise** the ladder stays and the passes are reported.

## Measured and not proposed

- **Escalating only on a stop** (not on a label disagreement). From the saved runs: held-out median 8.4 s and mean 14.0 s instead of 20.2 s and 25.5 s, at **22/33** (loses PostgreSQL run 3); with change 1, median about 7 s. Tuned **47/51** (loses 7-Zip runs 1 and 2). It is the largest time saving measured, and it costs one held-out complete, below the floor.
- **A second attempt that reruns only the mapping agent** (same Read, list and labels). In the 8 label-triggered held-out second attempts of this round the stage was the same and only the program changed. But in this round's tuned set 7-Zip's 2 rescues came from a second Read that chose a different stage, and so did HAProxy's 3 in today's earlier held-out round. It would lose those.
- **A containment test that walks up the parents everywhere it is used** (not only in the nesting test): Fly 15.6 s → 14.7 s. Change 1b uses it only where it is measured to matter.

## What stays

First attempts alone: held-out median about 6.9 s with the trial, slower than Crawl4AI's 5 s. The stops behind the 5 rescues come from Read (2), the mapping agent (1) and the field rules (2); fewer of them would cut more time, and is not part of this proposal.

## Decisions

1. **Change 1** (a and b) as written.
2. **The paired medium passes:** about 1M input tokens; the profile default changes only if medium grades as well as high on the same first attempts and is faster.
3. **Escalating only on a stop** is not proposed: it would take the median to about 7 s at 22/33 and 47/51. Yours to call if the floor can move by one.

## Order

1. Change 1; the 4 replay fixtures and the 228 saved attempts must replay identically (`same-result.mts`).
2. The bench option; two paired passes at medium; the report.
3. If kept: the profile default becomes `['low', 'medium']`; both sets live once on the final code.

## Built and measured (2026-11-12)

The owner chose all three: change 1, the medium passes, and escalating only on a stop. Escalating only on a stop was then measured live, fell below both floors, and the owner brought the old rule back. **What stays:** change 1, the bench's `--from` and `--efforts` options, and `discover`'s `calls` hook may now return `undefined` to leave an attempt live. Uncommitted on `haptic-efficiency`.

**The final code, both sets live** (`fast-tuned`, `fast-heldout`):

| | Complete | Median | Mean | Tokens per discovery |
|---|---|---|---|---|
| Held-out, `eff` → final | 23 → **24**/33 | 20.2 s → **6.1 s** | 25.5 s → 19 s | 37k → 39k |
| Tuned, `eff` → final | 49 → **49**/51 | 4.4 s → **3.5 s** | 9.6 s → 5 s | 15.9k → 14.2k |

Both floors hold. The median fell far more than the 14 s estimated: the live list choice ran slower than its replay (up to 1.8×), so removing it saved more live. Per held-out site, the median run took Fly 31 → 6 s, TypeScript 20 → 4 s, DigitalOcean 7 → 4 s, Go 8 → 5 s. One round; the same 13 of 33 discoveries made a second attempt.

**Change 1:** built as written; 228 of 228 saved attempts replay identically; the offline tests and the package check pass.

**Escalating only on a stop (measured, then removed):** `discover` tried the next effort only when an attempt did not get ready.

**Medium, paired on the saved stops** (`med1-*`, `med2-*`; the bench's new `--from` and `--efforts` options):

| | High (saved) | Medium, pass 1 | Medium, pass 2 |
|---|---|---|---|
| Held-out stops rescued | 5 of 5 | 3 of 5 | 4 of 5 |
| Tuned stops rescued | 6 of 6 | 5 of 6 | 6 of 6 |
| Held-out second attempt | 22 s | about 13 s | about 12 s |

The gate failed, so the ladder stays `['low', 'high']`.

**Both sets live with change 1 and escalation only on a stop** (`speed-tuned`, `speed-heldout`):

| | Complete | Median | Mean | Tokens per discovery |
|---|---|---|---|---|
| Held-out, `eff` → now | 23 → **19**/33 | 20.2 s → **5.6 s** | 25.5 s → 15 s | 37k → 33k |
| Tuned, `eff` → now | 49 → **44**/51 | 4.4 s → **3.5 s** | 9.6 s → 4 s | 15.9k → 14.2k |

**Below both floors, and below the estimate** (22/33 and 47/51 from the saved runs). Of the runs that fell short:
- **Old rule would have escalated** (ready, with a finding other than the count): held-out 3 (PostgreSQL runs 1–2, jQuery UI run 2), tuned 3 (7-Zip runs 2–3, Lua run 2). In the saved round only one such run was rescuable; in this round three held-out ones were. This is the measured cost of the rule, larger than the estimate.
- **Ready, wrong, no finding** (neither rule escalates): held-out Node.js run 2 (5/66), USENIX runs 1 and 3, Wikipedia runs 1 and 3, nginx; tuned Django News runs 2–3, zlib runs 1–2. First-attempt variance of the round.
- **Stopped twice:** held-out Go run 2, jQuery UI run 1.

With that rule the held-out time went to the second attempts' mapping agent (4.6 s per discovery) and Read (2.9 s), the first Read (2.3 s), second-attempt field rules (1.6 s).
