# Search relevance comparison — 2026-10-29

Evaluation only. No search discovery integration, engine changes or page extraction.

The same 90 real title/description/destination records were assessed twice by each model. Codex froze its judgments before provider calls. Four records were ambiguous and excluded from binary accuracy. Five entirely off-topic Bing lists were retained as separate rejection controls.

| Measurement                                    | Jev 1.14.0 | Groq gpt-oss-120b |
| ---------------------------------------------- | ---------: | ----------------: |
| Main relevance decisions                       |      70/72 |             72/72 |
| Off-topic control rejections                   |    100/100 |           100/100 |
| Useful results retained with a five-result cap |      16/18 |             17/18 |
| Clearly irrelevant results retained            |          0 |                 0 |
| Ambiguous results retained                     |          6 |                 5 |
| Requests                                       |         18 |                18 |
| Provider-reported input tokens                 |     29,106 |            20,198 |
| Provider-reported output tokens                |      3,150 |            24,303 |
| Sum of model-call durations                    |     3.61 s |           59.55 s |

Jev missed one German USB overview in both repetitions (0.41/0.43 against the frozen 0.5 threshold). 120b kept it. Labels mean plausible usefulness from the offered result fields, not verification of target contents. 120b used high reasoning, temperature 1, top-p 1 and Cortex emit recovery; no request failures, model retries or manual output corrections occurred. Raw responses independently confirm every usage total.

Acquisition limitation: all eight fresh DuckDuckGo queries and one browser-header diagnostic returned a human image challenge. Evaluation therefore used one unchanged earlier DuckDuckGo list plus eight fresh Bing lists. Only four lists supplied the main relevance comparison; this does not establish broad successful DuckDuckGo acquisition or relevance across eight useful topics.

The user selected Jev as the future search-relevance default, with 120b configurable. No production provider selection was implemented.

Benchmark policy and instructions: `benchmarks/search-relevance-policy.json`. Runner: `benchmarks/search-relevance.mjs` (`acquire`, `run`, `grade`). Acquired inputs, frozen judgments, exact provider requests, raw responses and results: `data/runs/search-relevance-2026-10-29-evaluation`. Failed acquisitions remain under `data/runs/search-relevance-2026-10-29` and `data/runs/search-relevance-2026-10-29-live`.

The independent relevance benchmark source/policy/suite named above were retired during the 2026-10-31 ordered-source cleanup. Their original generated inputs, provider responses, judgments and failures remain preserved under the dated data/runs paths. These historical results do not measure the current ranked-ID selection.
