# Search exclusion and task context — 2026-10-31

This slice replaces positive-probability sorting with a conservative exclusion question and search-provider order. The JSON loop exhausts retained candidates before rewriting; the success minimum reports sufficiency rather than stopping visits. The shared visit cap remains unchanged and leftover eligible candidates are returned as `unvisited`.

Caller `asOf` is optional reference time, passed unchanged to existing model contexts. JSON owns its interpretation; it introduces neither a native clock nor new task restrictions. HTML author/reviewer prose distinguishes item evidence from group properties and prefers justified detail links when current information cannot resolve the task. The chat selection adapter now includes the configured questions and uses neutral answer metadata. No model or interaction capability was added to finished execution.

Evidence root: `data/runs/search-exclusion-integration-2026-10-31`. Its `before.json` freezes prior source text/hashes; `assessment.json` records the checked outcomes and limits. The prior dirty Git tree is not the slice baseline.

## Focused model comparison

| Test                                        | Model HTTP requests | Reported input tokens | Reported output tokens | Seconds |
| ------------------------------------------- | ------------------: | --------------------: | ---------------------: | ------: |
| Jev, two unchanged saved candidate sets     |                   2 |                 3,699 |                    328 |   0.505 |
| Revised author/reviewer, two frozen pages   |                   4 |                71,912 |                 11,881 |  32.521 |
| Old author/reviewer wording, same two pages |                   4 |                76,789 |                  7,986 |  23.348 |

All ten responses reported usage. No page acquisition, manual correction or synthetic provider answer was used in these model evaluations. Authoring uses the production stage flow and original captures; stage trials remain mechanical. The old-wording comparison retains current context plumbing and changes the author/reviewer instructions only. This is two fresh samples per policy, not a reliable statistical estimate.

Jev excluded zero of twenty candidate appearances (fourteen distinct URLs). On both sets, the new first five equal the old positive filter's first five **without** sorting. The exclusion wording did not establish better classification; removing probability ranking changes visitation order.

For the ambiguous AllEvents capture, revised authoring still chose the broad meetup index rather than the specific Embedded AI detail. That navigation stage passed review. Old wording extracted broad AI events and was rejected. Neither result demonstrates a resolved source or the desired detail-link decision.

The formerly successful result-page control was not recovered by fresh authoring with either wording. Revised authoring selected twelve November links; the existing four-link collection allowance returned four. Review incorrectly demanded later links beyond that cap. Old wording extracted fifteen mixed-month/type records and was correctly rejected. Thus there is no demonstrated prompt regression from that single failed control, nor proof that the new navigation guidance is reliably better. These focused checks run one stage, not the outer repair/publication loop.

## One fresh end-to-end search

Run: `data/runs/search-connected-2026-10-31T17-51-25-226Z`.

Input was the unchanged `ai meetups in Vienna in November` plus caller reference time `2026-10-31T17:51:24.4450365Z`. All search/destination responses and models were fresh; no saved-page substitution or manual correction. Policy/source/driver hashes remained frozen.

The fresh first page differed from earlier runs. Jev kept all ten candidates. Five destinations were attempted in provider order, one published artifact and four unresolved sources. The five remaining eligible sources are explicit, including AI Austria Meetup and AI Builders Vienna on Luma. Follow slots were exhausted, so no rewrite occurred. The minimum of two successful sources remained unmet (`insufficient:true`).

The Meetup city listing artifact returned four relevant November records:

- November 3: AI Afterwork #6 – Autumn Edition.
- November 16: Women in AI Austria Vienna Meet up – m(AI)rry X-mas Edition.
- November 19: AI-Native Platforms: From AI-Assisted Operations to Running AI Workloads.
- November 25: 77th Deep Learning Meetup: Earth Image Labelling / Inside TED-AI.

This verifies the listing records, not individual event-page attendance conditions or completeness. Source native date attributes and visible time text disagree by an hour; both are preserved rather than silently normalized. A fresh AI-free replay returned exactly the same complete native output in 346.367 ms including HTTP. Execution model requests: zero.

Live model HTTP requests: **31** (one Jev, thirty Groq). Twenty-five responses reported usage: **1,034,987 input / 47,822 output tokens**. Six HTTP429 responses supplied no usage; their usage is unavailable rather than zero. Six subsequent retries succeeded. Observed response-to-retry gaps total **32.070 seconds**, matching Retry-After values of 2, 2, 11, 3, 5 and 9 seconds plus dispatch overhead. No proactive delay was added. Total time: **200.402 seconds**.

Reported input token attribution, including successful retries:

| Work                              | Input tokens |
| --------------------------------- | -----------: |
| Search exclusion                  |        1,784 |
| AIEventList German source/stages  |      315,243 |
| FounderCal source/repairs/reviews |      247,979 |
| AllEvents source/stages           |      105,813 |
| Meetup city source/author/review  |      189,403 |
| AIEventList English source/stages |      174,765 |

The German AIEventList stage followed event pages but could not qualify results at the next level. FounderCal repeatedly included a non-AI event and was rejected. AllEvents followed a general meetups index, then could not qualify a terminal stage. English AIEventList followed its global meetups index and encountered the existing model byte allowance. These unresolved paths consumed substantial context. Exact normalized URL deduplication does not treat English/German pages as equivalent.

The earlier November live run had one artifact/two online records, nineteen model requests, 358,593 input/37,009 output tokens and 112.488 seconds. The new run has more useful listing records but higher cost/time and different search results. It is not a controlled accuracy improvement. Conservative exclusion alone does not prioritize the best sources within a visit cap.

## Offline verification and ownership

`pnpm typecheck` and full `pnpm check` pass; `check-final.log` retains the full suite. Sixteen loop groups cover exclusion boundary/boolean answers, stable order, cap/unvisited reporting, exhaustion-before-rewrite, zero/minimum behavior, unchanged caller time and page permissions, deduplication, feedback and terminal failures. Search protocol controls verify the actual configured question reaches chat selection.

Existing HTML, JSON, XML, shaping and reference mocks verify reference time propagation; malformed time fails before effects and finished artifacts omit incidental discovery time. These are offline contracts, not paid semantic accuracy.

The HTTP-only PDF check passed at `data/runs/live-pdf-2026-10-31T17-47-05-936Z`. Independent focused review found no remaining material code/ownership blocker after fixing the chat question omission. All eleven engine files match the slice baseline. No new engine grammar, native planner, clock, semantic classifier, interaction layer or persistence was introduced.
