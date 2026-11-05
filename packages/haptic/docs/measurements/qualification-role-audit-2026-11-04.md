# Qualification closing audit, 2026-11-04

The frozen 38-job live batch predates the later Prism diagnostic-context correction. Its original provisional report, manifest, tools and build are preserved. Evaluator corrections below make no new model calls and do not turn historical failures into later successes.

## What was measured

The public discovery path received the original 17 requests twice and four agreed real requests once: Guardian, Spiegel, Animafabrik and Steam. No manual candidate corrections or saved-page substitutions were used. Published artifacts were independently executed with model calls forbidden.

The original 34 tasks yielded **24 complete, four useful partial, two unusable and four unresolved**. The prior comparison was 25/1/2/6. Thus useful outputs increased from 26 to 28, while complete outputs declined from 25 to 24. This does not establish broad accuracy improvement.

The four extra cases were:

| Case        | Adjudicated result | Actual result                                                                                                                                                               |
| ----------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guardian    | Useful partial     | Ten source-supported headline/URL rows, nine unique articles, one duplicate; all descriptions null including source-present previews.                                       |
| Animafabrik | Useful partial     | Six day groups contain 19 ordered class/time/teacher/level entries; per-class note attribution is lost in joined day-level strings.                                         |
| Steam       | Complete           | Exact caller fields `amount:19.99,currency:"EUR"` for the actual current base-game offer. Older 7.99 evidence is not current truth.                                         |
| Spiegel     | Unresolved         | Actual HTTP429 responses exhausted the existing bounded SDK retries. The misleading provider-stream label does not mean an HTTP200 SSE response. No extra rerun was hidden. |

The 38-job batch dispatched 301 provider requests and reported 3,412,602 input / 734,493 output tokens. Usage was unavailable for nine requests. Wall time with two workers was 1,156,171 ms. Observed HTTP429 retry gaps totalled 45,103 ms; this is not a precise sleep measurement. The nine unknown-usage requests were actual HTTP429 responses. Execution made zero model calls. The closing runner verified all 212 frozen file hashes.

The separate focused XML experiment failed: nine requests, 51,954 input / 35,795 output tokens, 98.188 seconds, no artifact. Correct published-Prism ownership is established by implementation checks; this model attempt does not demonstrate successful XML discovery.

A later, separate XML retest followed the mechanical diagnostic-context correction. It returned a working artifact in 15 requests, 99,833 input / 28,166 output tokens and 78.052 seconds. AI-free execution took 107.042 ms and acquired the correct PDF; four controlled variants also passed. The automatically generated schema misleadingly describes a URL field as base64, and semantic review remained negative. Thus the artifact fulfilled the acquisition task while schema metadata was wrong. This is focused post-fix evidence, not a replacement for the failed first XML run or a regrading of the frozen 38 jobs.

## Evaluator defects and correction

The original helper matched unlabeled bags of values. It could call a record complete after its headline and description traded fields. It could also overlook duplicated URLs or unrelated scalar entries in an otherwise correct link list. Those are defects in the measurement, not proof of improved product accuracy.

The existing benchmark helper now accepts explicit evaluator roles. Every record fact identifies its role; `roles[role].keys` identifies its own fields. These declarations come from the request and key meaning before values are compared. Caller-specified roles retain their exact fields. A generated schema can explain an unfamiliar key, but cannot define the expected answer or weaken the request. Unknown or ambiguous meanings return `classification:null,scorable:false`. This is an evaluator gap, not a demand that Haptic's caller manually approve artifacts.

For example, an independent news oracle can declare:

```json
{
  "roles": {
    "headline": { "keys": ["headline"] },
    "description": { "keys": ["intro"] }
  },
  "expected": [
    {
      "id": "source-entry-1",
      "identity": [{ "role": "headline", "kind": "exact", "value": "Source headline" }],
      "details": [{ "role": "description", "kind": "exact", "value": "Source introduction" }]
    }
  ]
}
```

A value found in `intro` cannot satisfy the headline role. Missing source-present details remain partial. Truly source-absent descriptions may be null. Unrelated parent values cannot repair child associations; explicit grouping-role inheritance remains available.

Explicit one-per-target contracts use `uniqueResults:true`; count ceilings use `maximumCount`. Duplicate diagnostics do not silently deduplicate data. Link objects use declared `valueFields`; evaluator-declared `metadataKeys` preserve valid labels and metadata. Undeclared extra field meanings stay unscorable rather than being silently ignored or globally rejected. Unrelated bare strings in a result list are unmatched results. Unknown object field meanings are unscorable rather than automatically complete. These are benchmark declarations, not hardcoded library fields.

Sixteen benchmark test groups include the original controls and new role-swap, unknown-role, duplicate/junk, count and parent-context negatives. Six independent standalone negative/control groups also retain the old grader for reproducible before/after evidence. No production path is added.

The actual completed Django, GitHub and curl cases have correct own-field roles; the added negatives do not retroactively make them failures. The independent manual audits confirm the full article/change-list cases and joined timetable layout. All 38 jobs and both stages have closing audit coverage: 76 ledger rows.

One additional oracle defect matters: Guardian's aria-label-only headline pool missed alternative literal visible headings attached to the same article URLs. Manual source inspection supports all ten returned pairs; there are still only nine distinct articles and missing descriptions. Its category stays partial. Correcting the matched count is evaluator repair, not better model output. The frozen provisional report remains unchanged.

## Original scorecard

These are the same original, subjective, unweighted categories. Overall is a whole-product assessment, not an arithmetic average or an engineering-only replacement.

| Category                   | Original | Current | Reason/barrier                                                                                                                                                                     |
| -------------------------- | -------: | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idea                       |      8.5 |     8.5 | Strong portable-artifact/discovery/replay separation; universal completeness/reuse unproved.                                                                                       |
| Engine                     |      8.5 |     8.5 | Unchanged engine and working AI-free execution; no basis for score inflation.                                                                                                      |
| Transport/readers          |        8 |       8 | Shared mechanics and terminal controls work; non-rendered HTML data is still outside learned extraction capability.                                                                |
| Discovery architecture     |      5.5 |       8 | Real ownership, local handoff and JSON-policy improvements; traversal, context and repair interactions remain substantial. Correct architecture does not establish model accuracy. |
| Search                     |        6 |       7 | Earlier consolidation stands; this URL batch does not revalidate search.                                                                                                           |
| Nisc alignment             |      7.5 |     8.5 | JSON policy, mechanical interpreter, published Prism and AI-free replay; no database/native planner.                                                                               |
| Extensibility              |      6.5 |       8 | One shared host registry improves adapters; additional adapter capabilities remain unproved or intentionally deferred.                                                             |
| Broad unattended readiness |      4.5 |     4.5 | Wrong targets and unsupported complete verdicts persist; partials are useful but are not proof of completeness.                                                                    |
| Overall                    |      6.5 |     7.5 | Engineering improved materially; central discovery reliability has not reached the same standard.                                                                                  |

SQLite still returns `hp1.html` while review names the real archive. Zlib's second output includes unrelated `zipknit17.tar.gz` while review says it was excluded. Guardian's reviewer claims descriptions are present although all returned descriptions are null. Ruby and release-note partials also receive unsupported completeness claims. These are distinct from the approved policy of returning honest useful partials, and they prevent a readiness increase. Deferred scheduling, notifications and browser interaction are not new penalties in that score.

## Evidence ownership

- `data/runs/nisc-qualification-2026-11-04/live/report.json`: original provisional live report; unchanged.
- `live/original-tools/hash-ledger.json`: all 212 original hashes verified, mapping mutable original tools to exact archives. The original manifest/report are not rewritten after evaluator edits.
- `provisional-frozen/preservation.json`: exact grader/test/policy/oracle/runner/report copies preserved before the first evaluator correction.
- `role-aware-audit/audit-2026-11-04T12-25-59-271Z.json`: closing 76-stage supplemental ledger.
- `independent-role-audit/code-quality-role-audit.json` and `real-case-role-audit.json`: independent source/role adjudication, including the actual real-case layouts.
- `focused-xml/final-evidence.json`: pre-diagnostic-fix failed XML experiment.

Future paid runs need a new freeze with explicit role contracts; the historical evidence runners and their old role-free contracts must not be reused as a new accuracy claim. This closing slice changes benchmark evaluation only.
