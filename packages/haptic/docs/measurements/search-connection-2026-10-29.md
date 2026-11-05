# Connected search verification — 2026-10-29

## Input and actual path

Unchanged input: `Show me a list of ai meetups in Vienna!`.

The public `eden-next/search` factory and JSON workflow performed query construction, first-page HTTP acquisition, provider-declared extraction/URL unwrapping, batched Jev relevance, bounded source selection, normal existing discovery for each selected URL, artifact publication and mechanical execution. Separate fresh HTTP replays used only `createWebOperations`, `{url}` and each returned artifact. No manually supplied destination URLs, event names, selector answers, expected values or output schema entered these runs. No web search tools supplied their results.

## Four bounded runs

| Run | Search page | Returned artifacts | Fresh model requests | Input / output tokens | Total wall time |
| --- | --- | ---: | ---: | ---: | ---: |
| Initial connection | Fresh HTTP | 2/5 selected sources | 10 | 197,384 / 17,489 | 147.20 s |
| URL-context retry | Fresh HTTP | 0; no search results | 1 | 335 / 708 | 62.21 s |
| URL-context verification | Recorded original search page | 3/5 selected sources | 13 | 242,191 / 19,323 | 213.86 s |
| Final contribution-scope verification | Recorded original search page | 3/5 selected sources | 20 | 521,276 / 43,093 | 358.88 s |

All 44 provider responses reported usage and were saved before parsing. Across the four runs: 961,186 input and 80,613 output tokens. No provider failures were relabelled as empty successes. Relevance/model outputs were not manually corrected. Recorded-source means the unchanged first actual HTTP response, not recorded model answers: Jev, authoring/review and destination HTTP were fresh. Fresh Jev calls can rank near-tied sources differently, so selected source sets are not identical across runs.

In the fully live retry, DuckDuckGo returned its recognized no-results layout for both the exact instruction and 120b's automatically generated `AI meetup Vienna`. The workflow exhausted its single configured alternative query and returned `insufficient:true`, zero selected sources and zero artifacts. That is not a successful list or proof that no meetups exist. The provider behavior prevented that run from exercising destination discovery.

Final-run breakdown: Jev 1 request, 1,631 input / 164 output tokens, 0.266 s; 120b 19 requests, 519,645 input / 42,929 output tokens. Of 358.88 s total, 240.27 s was explicit benchmark quota pacing, including the initial quota-window wait; summed model request time was 111.75 s. Pacing is benchmark-driver policy, not engine or database overhead. 120b retained high reasoning, temperature 1, top-p 1 and Cortex emit recovery.

## Corrections and remaining failures

Initial declarations sometimes inferred extra navigation because the task-stage context contained no actual starting URL. Forwarding the known URL as a separate `STARTING DOCUMENT` message improved the controlled run, but another declaration still planned how to answer the global question from a single source. The generic declaration contract was clarified: return this document's contribution; the caller handles other starting documents; list/multiple-items/freshness alone are not navigation requests. The unchanged instruction, declaration shape, permission ceiling and engine were preserved. No site or meetup rule was added. The final selected set had no navigation-permission failure; this is not proof of perfect intent classification on other inputs.

The final run returned:

| Source | Outcome | Native records |
| --- | --- | ---: |
| `aieventlist.ai/en/cities/vienna/` | Reviewed artifact and fresh AI-free replay | 3 |
| `aiwhatson.com/EU/AT/vienna` | Reviewed artifact and fresh AI-free replay | 1 |
| `the-power-of.ai/ai-events/vienna` | Unresolved; no artifact | 0 |
| `meetup.com/vienna-ai/` | Unresolved; no artifact | 0 |
| `aieventlist.ai/cities/vienna/` | Reviewed artifact and fresh AI-free replay | 3 |

Seven raw records are **not seven current distinct meetups**. The two language pages repeat the same three past event listings (14, 12 and 1 October 2026). The other record is an ongoing `AI Tinkerers — Vienna (monthly, 2026-27)` directory listing. No exact next meetup date was established. The two unresolved sources did not publish accepted rules; absence of an artifact is not proof of absence of relevant information. Intermediate runs also returned online-event cards; those are not silently promoted into a physical Vienna meetup list.

Final fresh replay: 3/3 completed, zero model calls, 114.67 / 359.03 / 68.50 ms including HTTP. All eight returned artifacts across the three artifact-producing runs had separate fresh mechanical executions. These are execution/reuse observations, not independent semantic-completeness grades.

## Verification and review

The engine and dependency lockfile were unchanged. Added capabilities are generic URL build/parse operations, a separate search entry and JSON composition. Profile/provider/prompt choices remain data. Root permission overrides were replaced by clearly nested per-destination `page` options, not global page caps.

Four checkpoint roles reviewed Nisc alignment, grammar, correctness and quality. Findings corrected: wrapper-origin/path admission, repeated result/empty admission after recovery, immutable observation values, explicit allowance scope, required metadata mappings, unique result IDs and owned callback/settings references. The two generic declaration-context changes received focused independent contract review; there was no repeated whole-crew cycle.

Typecheck, the existing offline check suite and six new search behavior groups pass. The unchanged live PDF check passed at `data/runs/live-pdf-2026-10-29T21-24-31-216Z`, downloading the same 116,547-byte PDF with hash `f09ffbee2a526425f2ee43a7cef12577dcaf9258a5a7f317081279baacd43058`. No CAPTCHA or browser adapter was invoked during these search tests. Optional recovery remains an explicitly injected discovery-only operation; isolated CAPTCHA research stays outside the default library path.

## Evidence

- `data/runs/search-connected-2026-10-29T21-23-57-022Z`
- `data/runs/search-connected-2026-10-29T21-31-35-478Z`
- `data/runs/search-connected-2026-10-29T21-34-44-013Z`
- `data/runs/search-connected-2026-10-29T21-45-26-097Z`

Each directory retains its original input, frozen workflow/profile, raw requests/responses, captured sources, outcome and summary. Returned artifacts and fresh replay results remain in their owning directories. Later source changes do not regrade earlier results.
