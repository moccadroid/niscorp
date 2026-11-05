# Focused live PDF run after feedback/resource correction

One fresh discovery ran with the exact request, caller schema (including `uniqueItems: true`), grading, test driver, provider audit, model settings and allowances from `data/runs/live-pdf-caller-uniqueness-2026-11-01`. Current runtime/workflow snapshots were frozen before running. No saved responses, supplied model answers, manual corrections or further paid attempts were used.

## Outcome

**Unresolved; no artifact, article visit, PDF download or independent execution.**

The task declaration correctly requested navigation and resource fetching. The live XML acquisition succeeded (HTTP 200, 2,965 bytes). XML source authoring then selected paper entries but retained only their PDF URLs:

```json
{
  "selector": "//atom:entry",
  "namespaces": { "atom": "http://www.w3.org/2005/Atom" },
  "fields": {
    "url": "string(atom:link[@rel='related' and @type='application/pdf']/@href)"
  }
}
```

Its mechanical trial passed. The original feed also contains the article-page link, but that value was omitted from the selected records. The following reference-program author received this exact independent example scope:

```json
[
  {
    "input": {
      "url": "https://export.arxiv.org/api/query?id_list=1706.03762",
      "items": [{ "url": "https://arxiv.org/pdf/1706.03762v7" }]
    }
  }
]
```

That author attempted to reconstruct article URLs from PDF URLs with splitting/joining and branching. All three provider answers were malformed JSON. Cortex supplied the concrete JSON parse errors for recovery; the second and third answers remained malformed. The errors occurred at character positions 457, 343 and 334. The public reason is `Reference author failed. stopped: step limit reached (3)`.

The source author had the unchanged original request, actual XML, caller result schema and `requiresNavigation: true`; the omission was not caused by absence of that request or source link. The downstream writer lacked the omitted article URL. The reconstruction attempt and malformed output are observed; one run cannot establish that missing context alone caused the syntax errors.

## Numbers

| Phase                                | Requests | Input tokens | Output tokens | Provider interval |
| ------------------------------------ | -------: | -----------: | ------------: | ----------------: |
| Task declaration                     |        1 |          671 |           980 |           2.376 s |
| XML source author                    |        1 |        2,225 |         3,077 |           6.768 s |
| Reference author and Cortex recovery |        3 |       24,191 |        30,268 |          64.194 s |
| Total                                |        5 |       27,087 |        34,325 |          73.338 s |

Total experiment time: **84.954 s**. Discovery itself: 84.632 s; preparation: 319.294 ms. All five provider requests returned HTTP 200 and reported usage. Actual rate-limit responses and waits: **zero**. One fresh source HTTP request, no execution HTTP/model requests. The remaining 11.616 s includes local recovery/validation, evidence recording, preparation and orchestration; it was not separately profiled and is not an engine-only measurement.

## What this establishes

Neither the retained-failure correction nor the resource URL projection/reviewer context was exercised: source selection passed without inspection or failed-candidate feedback, and the run never reached downloads/output shaping/review. The earlier offline evidence remains valid; improved model behavior for those corrections is still unproven.

An earlier producer-to-consumer gap is visible: mechanically valid XML selection can discard a navigation value needed by the next author. That handoff merits a focused design/evidence review before any further changes or paid run. No retry-budget increase, prompt adjustment or new machinery was introduced in this experiment.

The frozen source/build, request, schema, grading and harness stayed unchanged during the run. All 11 engine files match the previous live run. This is one unsuccessful fresh discovery, not an updated benchmark score.

## Evidence

`data/runs/live-pdf-feedback-resources-2026-11-02/` contains:

- `input.json`, `grading.json`, `scope.json`, complete `code/` snapshot and `frozen.json`;
- all five exact provider requests and raw responses, captured before parsing;
- `http-1.json` with the fresh XML source;
- `discovery.json`, `events.json`, `calls.json`, `http.json`;
- `summary.json`, `analysis.json` and `closure.json`.

The original duplicate-output run, caller-uniqueness failure and this new failure remain separate and unchanged.
