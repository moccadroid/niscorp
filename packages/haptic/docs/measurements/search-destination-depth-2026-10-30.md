# Search destination depth correction — 2026-10-30

## Correction and ownership

The search handoff already started each selected destination's discovery at depth 0 with fresh visited/alias state. It did not subtract a DuckDuckGo hop. The actual defect was a disabled permission: omitted `page` options inherited direct discovery's `allowLinkFollowing:false`, making depth 1 unusable.

`src/search/default-profile.json` now owns explicit `pageDefaults:{allowLinkFollowing:true,linkDepth:1}`. The existing search JSON merges caller `page` fields after these defaults, then passes them unchanged to ordinary destination discovery. No engine, discovery workflow, model prompt or instruction changed. DuckDuckGo acquisition, CAPTCHA continuation and result-link selection consume none of a found destination's depth or page allowance.

Caller false/zero/partial overrides remain effective; configured larger depths remain possible. Direct-URL discovery retains its disabled-following default. The existing destination page allowance remains four acquired pages including the destination's starting page. This is a separate JSON-configurable bound, not a three-link native cap. Search does not force following links when the requested information is present on the listing page.

## Live request, unchanged

`Show me a list of ai meetups in Vienna!`

Both runs used fresh HTTP and fresh model responses. The live driver supplied no hand-authored page options, selected source URLs, selectors or corrected answers. DuckDuckGo returned ordinary results in both runs; the connected recovery adapter was available but no CAPTCHA call was required.

### Interrupted first run

`data/runs/search-connected-2026-10-30T00-10-11-677Z`

The actual model input for the found Meetup group had depth 0, `canFollow:true`, linkDepth 1 and maxPages 4. The workflow then fetched three actual event URLs:

- `/vienna-ai/events/317176243/?eventOrigin=group_upcoming_events`
- `/vienna-ai/events/317104140/?eventOrigin=group_upcoming_events`
- `/vienna-ai/events/316892292/?eventOrigin=group_past_events`

Their combined next-stage model input had depth 1 and `canFollow:false`. The fourth page slot was the starting group page; none was spent on DuckDuckGo. These observations establish actual one-hop acquisition, not a published event-detail artifact or complete event coverage.

Before sending that next model request, the benchmark guard rejected its conservative reservation: 260,924 input bytes treated as token upper bound plus 16,384 output tokens, exceeding the 225,000-token headroom-adjusted minute allowance. The request was saved but **not dispatched**. The driver aborted; no completed search outcome or returned artifact is claimed for this run. All response/candidate/failure evidence is retained.

The benchmark reservation now additionally accepts a documented model context ceiling from `benchmarks/discovery-pacing.json`. Groq documents a [131,072-token context window for this model](https://console.groq.com/docs/model/openai/gpt-oss-120b). An admitted input cannot exceed that ceiling. The helper uses the smaller of its conservative byte bound and that configured ceiling, then conservatively adds the requested output allowance. This is pacing arithmetic, not a tokenizer or proof that an input fits the model. Unknown models retain the old bound. Neither prompts/content nor provider quota/library budgets are changed. A new offline test verifies large and small inputs, invalid ceilings and unchanged request content.

### Completed fresh rerun

`data/runs/search-connected-2026-10-30T00-17-29-394Z`

| Destination | Outcome | Raw returned entries |
| --- | --- | ---: |
| AIEventlist Vienna | Reviewed artifact and fresh AI-free execution | 3 |
| AI What's On Vienna | Reviewed artifact and fresh AI-free execution | 1 |
| The Power of AI Vienna | Reviewed artifact and fresh AI-free execution | 15 |
| Meetup Vienna AI | No artifact: three author attempts exhausted on zero-match CSS / missing title field | 0 |
| AI Tinkerers Vienna | HTTP 403, no artifact | 0 |

All destination author contexts had depth 0, canFollow true and linkDepth 1. The three returned artifacts selected data directly from their starting listings; their visited sets each contain only that destination and no DuckDuckGo URL. They did not exercise onward traversal. No successful returned event-detail artifact was produced in this pair of tests: actual depth-1 acquisition was observed in the interrupted run, while only listing-page artifacts were returned in the completed run. Do not combine those into a successful multilevel-artifact claim.

Nineteen raw entries are not nineteen verified AI meetups. AIEventlist includes historical October listings, AI What's On includes an ongoing Tinkerers listing, and The Power of AI includes conferences and Comic Con. The semantic reviewer accepted that broad selection. These are remaining model/selection limitations, not corrected or hidden by this slice. The selected source set also differs from the earlier CAPTCHA integration run; artifact counts are not a controlled accuracy comparison.

| Completed rerun measurement | Value |
| --- | ---: |
| Provider requests | 15: 1 Jev relevance + 14 Groq 120b |
| Provider-reported input / output tokens | 302,716 / 30,060; all 15 reported |
| Full time, including fresh artifact execution | 216.906 s |
| Benchmark quota waiting | 132.151 s |
| Summed model request time | 76.560 s |
| Fresh artifact execution | 3/3 completed; 422.508 ms combined including HTTP |
| Execution model calls | 0 |

Across both runs, 28 provider requests were sent and all reported usage: 556,421 input and 53,370 output tokens. The locally blocked request is excluded from those counts. Rechecking that unchanged saved request offline gives a corrected reservation of 147,456 against the 225,000 pacing allowance; this is an offline guard check, not a dispatched model request or a recovered artifact. Combined evidence is in `data/runs/search-depth-correction-2026-10-30/verification.json`.

## Verification

Typecheck and the full offline checks pass. Search checks verify profile defaults forwarded intact to every destination, explicit false/zero/page-budget overrides and larger profile depths with partial caller overrides. Existing discovery tests exercise actual depth 0/1 traversal. The unchanged PDF check passed at `data/runs/live-pdf-2026-10-30T00-09-33-965Z`, returning the same 116,547 bytes and original hash. No engine, direct discovery workflow or dependency-lock changes were made. No broad reviewer rerun was needed for this small JSON-policy correction.
