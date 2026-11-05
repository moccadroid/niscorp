# Search cleanup and 120b ordering — 2026-10-31

Evidence: `data/runs/search-ranking-cleanup-2026-10-31`. `before.json` is the slice baseline; the checkout had pre-existing changes. Original HTTP captures, failed trials, provider bodies and credentials were preserved.

## Audit and cleanup

The audit found poor search-selection policy and obsolete protocol wiring, not a hidden native crawler or engine regression. Full page discovery still has substantial author/review/repair context cost. This slice changes which sources receive that work; it does not claim to remove that cost.

Deleted the complete `src/search/relevance.ts` adapter, its independent Jev/chat selection modes, probability/boolean envelopes, exclusion threshold, question substitution, separate selection credential/client and scored filtering. Deleted the obsolete independent relevance benchmark runner/policy/suite; its dated generated evidence remains. Removed queue merge/dedup scaffolding that could append omitted sources as fallback and the redundant `unvisited` projection. Search attempts preserve original results and ranked IDs instead.

Removed the latest unproven author navigation-preference addition and redundant item/property sentence. Kept existing task evidence, semantic review, prepared HTML, caller time, permissions and repair machinery. Query rewriting now uses the existing shared model-operation factory instead of duplicating its native timeout/execution wrapper. Optional Jev CAPTCHA code is preserved.

## Current ownership

- `ranking.ts` offers one small typed output, `{rankedIds:string[]}`.
- Existing Cortex `createModelOperation` performs the model call and bounded output-shape recovery, using the discovery provider and author credential.
- JSON prepares every available normalized candidate, removes previously visited/duplicate URLs, constructs metadata-only context, declares model settings and checks membership, uniqueness and the remaining visit allowance.
- JSON maps IDs in the emitted order and visits only that shortlist. Unknown, duplicate or over-limit IDs fail before destination work; no separate semantic ranking-repair loop or fallback exists.
- The existing `maxFollowResults` profile default is five, caller configurable and shared across rewritten queries. Selecting fewer or none is valid. Effective page/resource allowances come from the existing discovery profile, then search defaults and caller overrides.
- Model context labels these allowances `perDestination`. They do not reduce the number of source visits. The public caller field remains `page`.
- No engine changes, new dependencies, planner, persistence or model activity in finished artifact execution.

Four checkpoint roles graded the code/contracts 9/10, not semantic ranking accuracy. They identified an omitted-effective-budget context gap and duplicated native query-model plumbing; both were corrected with ordinary existing operations. The first model test exposed a further budget-scope ambiguity described below.

## Focused real-model evidence

All tests use the production `search-query` JSON flow and real 120b. Search metadata is unchanged from the saved captures. No destination fetching, page discovery, authoring, manual corrections or grading labels enter the calls. Source/build hashes remain frozen during each run. Settings: high reasoning, temperature 1, topP 1, emit; existing profile bounds unchanged.

| Run                                         | HTTP model requests | Reported input | Reported output |     Time |
| ------------------------------------------- | ------------------: | -------------: | --------------: | -------: |
| Initial ranking setup, three candidate sets |                   3 |          3,716 |           8,138 | 19.523 s |
| Clarified scope, same three sets            |                   3 |          3,842 |           7,784 | 18.648 s |
| Total                                       |                   6 |          7,558 |          15,922 | 38.171 s |

All six responses reported usage. No rate limits or model output repairs occurred in these calls.

Initial evidence: `models-2026-10-31T18-21-39-615Z`. The latest candidate set produced four directory IDs and omitted AI Austria/Luma. The raw answer explicitly treated the four-page **per-source** allowance as a four-page total search allowance. It also assumed each source needed to provide a whole list and that directories might make individual matches redundant. This run remains failed against the intended selection outcome; valid IDs did not establish useful selection.

The correction labels the context `perDestination` and states the independent allowance scope. The same generic prompt also clarifies that individual sources may contribute part of a multi-item answer, and a hypothetical directory does not establish redundancy. No website/category-specific rule was added.

Revised evidence: `models-2026-10-31T18-24-18-475Z`.

| Saved candidate set         | Returned IDs, in visit order |
| --------------------------- | ---------------------------- |
| Original November search    | 1, 0, 7, 2, 4                |
| Historical rewritten search | 3, 5, 0, 1, 2                |
| Latest November search      | 0, 6, 2, 5, 9                |

The latest five are:

1. AIEventList Vienna.
2. AI What's On Austria.
3. AllEvents AI Vienna.
4. AI Austria Meetup.
5. AI Builders Vienna — November 26, Luma.

The original provider-first-five omitted both AI Austria and Luma and included FounderCal, a generic Meetup finder and the English duplicate of AIEventList. The revised model shortlist drops those three. On the original older set it now includes Vienna AI Engineering. On the rewritten set it puts Luma first.

This is one fresh sample for each of three fixed sets per wording, not a statistical reliability estimate. Broad directories still lead the latest shortlist. Historical metadata contains year ambiguity, and the old rewritten query itself contains 2025; this comparison preserves that input. It does not establish current target access, live extraction, completeness, lower end-to-end cost or successful artifacts for these newly selected sources. No full paid search was run after replacement.

## Offline verification

Twenty-one loop groups cover ranked order, top-five/default and larger caller limits, effective configured per-destination limits, false/zero overrides, metadata-only context, no fallback after fewer/empty answers, duplicate URLs before ranking, unknown/duplicate/over-limit IDs, reduced allowances after rewriting, observations, cancellation and terminal evidence failures. A real Cortex protocol control repairs malformed `rankedIds` output and preserves emitted order; its provider is mocked and unpaid.

Required typecheck/full offline checks and the HTTP-only PDF check pass. The PDF evidence is `data/runs/live-pdf-2026-10-31T18-21-11-327Z`. All eleven engine files match the slice baseline. These code/transport checks are separate from the fresh ranking measurements above.

## Subsequent live discovery on the frozen five

After explicit user approval, `data/runs/ranked-five-live-2026-10-31T18-36-39-184Z` resumed the existing production JSON `search-loop` with the exact completed ranking above. Search metadata/ranking were frozen; all destination acquisition, mechanical trials and separate artifact replays used fresh HTTP. No prompts, policies or source code changed during the run. No model answer or HTTP response was substituted.

All five destinations were attempted in the recorded order. AIEventList and AllEvents declined; AI What's On followed Vienna, attempted an unsupported November match, and could not qualify a terminal stage within the existing link allowance. AI Austria published an artifact returning three November events; Luma published one returning its event block.

Returned events: AI Afterwork #6 (November 3), AI Governance as a Scaling Factor (November 17), AI4Management-Edition (November 24), and AI Builders Vienna (November 26). All have Vienna venues in returned native text; original Luma JSON-LD confirms its year as 2026. Luma output remains a long event block, not a compact field projection. No caller output schema was supplied.

Fresh discovery plus replay: **18 Groq requests, 354,897 input / 32,748 output tokens, 98.049 seconds**. All responses reported usage. No HTTP429, transport retries or rate-limit waits occurred. Adding the already-completed ranking for this candidate set yields **19 requests, 356,133 input / 36,359 output tokens and 106.128 seconds**. This is measured stage time summed across the two runs; the search-page acquisition is excluded because its candidate list was frozen.

Both published artifacts returned exactly the same complete native data in fresh replays: **40.024 ms** for AI Austria and **312.142 ms** for Luma, including HTTP, with zero model calls. Fourteen HTTP captures preserve acquisition, trials and replays. Frozen input hashes and all eleven engine source hashes matched afterward.

The three unresolved directories consumed **208,426 input tokens**: AIEventList 59,270; AI What's On 123,239; AllEvents 25,917. AI Austria used 100,477 and Luma 45,994. The unresolved-source share remains substantial (58.5% including ranking), although below the prior run's 81.5%.

The earlier source-order run returned four listing records from one artifact at 1,034,987 reported input / 47,822 output tokens and 200.402 seconds, including 32.070 seconds of rate-limit waits. The new stage totals are 65.6% lower in reported input and 47.0% lower in elapsed time, with two usable artifacts. This is an observed improvement, not an isolated causal ranking benchmark: destination responses are fresh, the earlier run included search acquisition, and the intervening cleanup also removed unproven navigation prompt additions. It does not establish complete meetup coverage or general future reuse.

## Subsequent complete fresh search

`data/runs/search-connected-2026-10-31T20-18-26-641Z` ran the entire public search path from `ai meetups in Vienna in November`, with caller reference time and no supplied candidates, saved responses or corrected answers. DuckDuckGo, 120b ordering, destination acquisition, trials and the final artifact replay were fresh. Code, profiles and driver hashes stayed frozen. No policy changes were made during or after the batch.

Ten candidates were returned; 120b selected five: AllEvents November, Vienna AI Meetup, AIEventList Vienna, AllEvents general AI, and AI Austria's calendar. The AI Austria Meetup group and Luma were absent from this fresh candidate pool. The generic Meetup city listing was present but not selected. Two selected slots went to distinct AllEvents URLs.

The full run used 15 Groq HTTP requests, all with reported usage: **261,411 input / 28,463 output tokens**, **82.072 seconds** including replay, zero rate-limit responses, retries or waits. No Jev CAPTCHA recovery was needed. Twelve HTTP captures retain actual search/destination/trial/replay responses.

Only Vienna AI Meetup published an artifact. It returned two explicitly online records: AI Summit (Virtual) — Run AI and Data Pipelines (November 4), and Google AI Deep Dive Ep 5 — Discriminative models (November 11). Native output consists of event text blocks rather than compact fields or individual event URLs. A fresh mechanical replay returned exactly the same complete data in **34.645 ms**, with zero model calls.

AllEvents November followed the general meetups category and then could not qualify output; AIEventList and general AllEvents declined; AI Austria's calendar returned HTTP403. The existing two-successful-source minimum was unmet. Reported input attribution: ranking 1,245; AllEvents November 78,171; Vienna AI Meetup 134,081; AIEventList 22,478; general AllEvents 24,826; AI Austria calendar task declaration 610.

The instruction did not explicitly require in-person events. Nevertheless, these global online listings do not reproduce the earlier useful local-event list, and there are no confirmed in-person Vienna records in this result. The appropriate quality verdict is poor/partial, not successful local coverage. Lower cost alongside fewer useful results is not evidence of a better answer. This fresh batch demonstrates automatic execution but does not establish reliable source selection or search quality.


## Paired sentence-restoration check

Evidence: `data/runs/item-evidence-paired-2026-10-31T21-58-27-147Z`. The generic instruction prohibiting transfer of site/group/collection properties to contradictory individual records is restored in both author and reviewer JSON prompts. This restores an explicit requirement; the experiment below did not demonstrate improved behavior. No engine, schema, ranking or repair implementation changed.

Eight fresh 120b verdict calls compare current versus restored wording on the same four saved-source candidates. Each paired wire request is identical except for the restored sentence. Settings remain high reasoning, temperature 1, topP 1 and emit with existing Cortex shape recovery. No shape repair or transport retry occurred. Current preparation and mechanical trials use unchanged saved source responses. No live pages, fresh authoring or search were tested.

Both wordings accepted the disputed two-global-online-event candidate and all three controls (Meetup city: four records; AI Austria: three; Luma: one). The actual fresh verdicts were replayed through root discovery publication, not inferred from attempt.artifact: all four artifacts and their native output were identical under both wordings. A run-local JSON profile disables author repair solely to hold the candidate fixed. The restored author prompt was not evaluated by fresh authoring.

Current wording used four requests, 166,795 input / 7,939 output tokens and 27.313 seconds including offline publication replay. Restored wording used four requests, 166,879 input / 6,309 output tokens and 22.976 seconds. Overall paid comparison plus publication replay took 50.358 seconds; reported totals are 333,674 input / 14,248 output tokens with 8/8 usage coverage and zero rate-limit waits. One sample per wording/case is not a speed or reliability estimate.

The disputed case was not caught by either wording. No publication decision improved and no control changed. This failed hypothesis does not justify another prompt patch or wider batch. Required typecheck and full offline checks passed; an independent scoped reviewer confirmed exact sentence-only source edits and highlighted the need to test the real root publication gate. All engine source hashes match the pre-change baseline.
