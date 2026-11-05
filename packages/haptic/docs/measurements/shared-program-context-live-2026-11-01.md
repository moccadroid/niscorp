# Shared program context: live PDF discovery

The current library produced an artifact from the original request and URL, downloaded the correct live PDF and executed that artifact again against fresh HTTP without AI. **The strict result-quality check still fails:** the result data lists the same PDF URL twice. The file itself is downloaded once per execution. The final reviewer accepted the duplicate data; no manual correction or regrading was applied.

## Fixed task and experiment order

The unchanged request starts at `https://export.arxiv.org/api/query?id_list=1706.03762`: visit each paper's article page, then download its PDF using the article pages. Caller permissions remain depth 1, at most five pages and five resources. The supplied schema remains an array of absolute PDF URL strings. It does not declare `uniqueItems`.

The first live experiment froze the then-current code, prompts, profile and test specification. All acquisition was live, including resource requests; saved responses could not substitute for a failed URL. It acquired the feed, article and correct 2,215,244-byte PDF, but final shaping exhausted its existing allowance. There was no published artifact or subsequent artifact execution.

The exact captured mapping programs exposed the remaining inconsistency. The reference author already saw `{input: nativeValue}` examples; the output author still saw bare native data with a caption saying it was available at `$.input`. Six parseable responses all referenced `$.pages`; another response exhausted its output tokens. Offline evaluation of the final unchanged program returns the exact correct PDF URL on the displayed bare value and fails on the actual engine scope. This is evidence of an input-contract mismatch, not proof of an intelligence ceiling.

## One shared correction

Both Prism authors now call the ordinary JSON `program-context` helper. It takes native values, uses the existing `json.encode` operation to show independent `{input: value}` scopes, and returns one user message. Its example list is explicitly not a runtime array. It replaces the separate encoders/headers. Output's sentence describing the examples was aligned with that same calling convention.

The helper is discovery-only and is absent from the returned artifact. Runtime input values, the engine, model schemas, source preparation, selectors, task instruction, budgets and semantic repair policy are unchanged. No website rule or native decision was added. The default model remains 120b/high reasoning/temperature 1/top-p 1/emit.

Before another paid run:

- The saved failing program and three successful JSON/XML programs were checked without editing those programs. Displayed-context behavior now agrees with actual engine behavior in all four cases. This is contract alignment, not a claim that the old program repaired itself.
- Normal tests compare the helper's scopes with real engine execution for scalar, array and nested object values. Nested source `$ref` properties remain opaque data. Both writer call sites must use the shared producer; empty examples fail before effects.
- Full typecheck/offline checks pass. A focused independent contract review found no material producer-to-consumer mismatch and explicitly reserved model-quality judgment for fresh testing.

Exactly one fresh live repeat followed. No prompts, settings or answers were altered during either run. The feed, article and PDF body hashes were identical across the two runs, despite fresh acquisition.

## Results

| Measure | Before shared context | After shared context |
| --- | ---: | ---: |
| Artifact returned | No | Yes |
| Strict output check | No artifact | Failed: duplicate URL |
| Actual provider requests | 12 | 8 |
| Mapping provider requests | 7 | 2 |
| Input tokens | 90,581 | 62,891 |
| Output tokens, including reasoning | 72,729 | 22,118 |
| Discovery execution time | 180.799 s | 57.422 s |
| Total test time | 181.146 s | 58.274 s |
| Actual rate-limit waits | 0 | 0 |
| Independent fresh artifact execution | Unavailable | 159.302 ms |
| Independent artifact preparation | Unavailable | 130.845 ms |
| Execution model calls | Not executed | 0 |

All twenty provider requests succeeded and reported usage. Combined usage is 153,472 input / 94,847 output tokens. These are two individual experiments, not a repeated-run speed guarantee or a new full-suite accuracy score.

The second discovery made six live HTTP requests: feed/article/PDF acquisition and the required fresh final trial. The additional independent artifact execution made three more, one for each endpoint. No page was substituted or manually corrected.

Actual fresh execution returned:

```json
{
  "data": [
    "https://arxiv.org/pdf/1706.03762v7",
    "https://arxiv.org/pdf/1706.03762v7"
  ],
  "visited": [
    "https://export.arxiv.org/api/query?id_list=1706.03762",
    "https://arxiv.org/abs/1706.03762v7"
  ],
  "limited": false
}
```

There is one resource, HTTP 200, 2,215,244 bytes, `%PDF-1.5`, SHA-256 `bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697`. The two identical data strings refer to that one file. The independent checks require each observed article PDF once, so both the final discovery trial and independent execution remain strict failures. A positive model verdict does not override that evidence.

Evidence directories:

- `data/runs/live-pdf-discovery-proof-2026-11-01/`: unchanged-code baseline, exact inputs, raw provider bodies, HTTP responses and failure.
- `data/runs/live-pdf-discovery-program-context-2026-11-01/`: fresh repeat, generated artifact, independent execution, downloaded PDF and strict duplicate failures.
- `data/runs/shared-program-context-offline.json`: unchanged saved-program alignment and controls.

Both paid experiments retained unchanged frozen files. No further paid tests followed the scoped repeat. Packaging checks pass, with optional peers separate and zero model imports during core execution. The required unchanged live RFC/PDF regression check also passes again: 116,547 bytes, `%PDF-1.5`, zero models. Earlier DNS/deadline failures remain recorded failures.

## What transfers from Snowdrop

A fresh read of Snowdrop's current `propagate-28d-v2-A1.md`, `summaries-read-28d-v2.md`, model adapter and `jev-20b-test-plan.md` adds three useful lessons:

1. Small writing jobs work with compact contracts. Its 20b job edits one summary with `{keep,add}`, using only the relevant evidence. The report measures 179 completed replay runs with 1.3-second median completed-run time; this is not a comparable Haptic benchmark.
2. Cheap completion is not semantic correctness. Its hand-read thirty-summary sample reports nineteen right/useful, six right but thin, three wrong/lost and two not useful. Errors introduced upstream can survive a later small editor that never sees contradictory evidence. Likewise, Haptic's mapping cannot recover a relevant record discarded during extraction.
3. The newer proposed test plan measures writers and judges separately before combining them. Its Jev support-check experiment is explicitly a plan, not evidence that a cascade works. This suggests measuring false acceptances and false rejections on fixed supported/unsupported cases before introducing any discovery judge/escalation change.

No 20b/Jev model switch, Snowdrop dependency, storage, queue or graph was introduced in Haptic. Potential role-specific model comparisons remain future experiments after their input contracts and acceptance cases are fixed.

## Decision and next experiment

Keep the shared context producer: its boundary is mechanically correct, the wrong-root loop is removed in the fresh repeat, and the requested end-to-end artifact/execution path now completes. Keep the duplicate output as a real remaining defect and the original failed experiments unchanged.

The next narrow experiment can test a caller contract declaring unique URL values through the already-supported standard `uniqueItems: true` keyword, with engine and prompts unchanged. That would be a distinct declared contract, not a retroactive alteration to the failed benchmark. It tests whether the existing mechanical trial/Prism correction handles a formal invariant before adding more semantic judgment. It must not become a global native deduplication rule: duplicate values can be meaningful for other requests. The automatic schema-authoring vocabulary does not currently offer this keyword; expanding it would be a separate reviewed grammar decision.
