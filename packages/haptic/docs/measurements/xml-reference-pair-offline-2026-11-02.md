# Paired XML reference authoring: offline verification

The approved change makes XML extraction and reference mapping one authoring unit. One job sees original current-frontier XML and proposes `{xml,mapping}` or requests an existing XPath inspection. JSON trials the combined rule before marking it ready. The independent XML extraction-to-reference-writer handoff is removed. This slice contains no paid model run.

## Ownership and deletion

- `XmlReferenceRuleSchema` combines the existing `XmlSelectionSchema` and published Prism `ConfigSchema`. Both candidate fields are required. The mapping contract describes its actual `{url,items}` input and `{links,resources}` result; field names remain dynamic.
- `author.xml.reference` is a static typed model-operation registration. It uses ordinary Cortex syntax/schema recovery. Native callbacks do not trial proposals, route work or accept artifacts.
- `discovery.json` selects this job for XML reference stages, supplies original source/context and owns trial, inspection, correction, allowances and readiness.
- Failed pairs retain both pieces, the actual trial error and `selectedValues`. A diagnostic XPath selection uses already-owned XML after a failed combined trial. It does not fetch pages, replace the failed trial, run on successful reference trials, or bypass the existing observation/input allowance.
- Rejected trials no longer produce an additional misleading zero-match diagnosis merely because their output is unavailable. The actual rejected trial remains authoritative. A successfully executed empty selection still faces the existing discovery evidence minimum.
- `referenceExtraction`, the successful-selection handoff, `referenceInputs` storage and the XML branch in the bare reference writer are deleted. `referenceProgram` now handles native JSON only. Failed candidates remain observable but unready; they cannot start onward acquisition.
- Standalone XML retains its selection job; HTML retains its current navigation mechanism. The published artifact's existing mechanical XML/Prism helpers remain unchanged.

## Saved failure

The unchanged XML from `data/runs/live-pdf-feedback-resources-2026-11-02` was supplied to production `test-source` and `source-request` helpers with HTTP/model effects forbidden.

1. The old extraction-only candidate is rejected by the new paired candidate schema.
2. A controlled pair retains the old PDF-only extraction but asks its program for the omitted article field. Its combined trial fails with `E_MISSING_PATH`; the stage stays unready.
3. Failure feedback includes the actual selected PDF value. The next request retains that error, selected value and original XML.
4. A controlled correction changes extraction and mapping together to use the actual source article link. The combined trial returns `https://arxiv.org/abs/1706.03762v7` and marks the stage ready.
5. All three malformed saved provider answers remain rejected. None was manually repaired or republished.

Zero HTTP/model calls. **The correction is a controlled offline candidate, not evidence that 120b repaired itself or that the failed live discovery now succeeds.** Original failed runs remain failed.

## Verification

| Check                        | Result                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`             | Passed                                                                                                                          |
| `pnpm check`                 | Passed; complete offline suite and 15 benchmark-support tests                                                                   |
| Grounded discovery groups    | 14 passed                                                                                                                       |
| Grounded acquisition groups  | 17 passed                                                                                                                       |
| Paired Cortex wire recovery  | Malformed JSON, then missing mapping, then valid pair: 3 controlled local-provider responses                                    |
| Paired null mapping          | Rejected by the combined reference result contract; valid XPath cannot make it ready                                            |
| Paired repair and inspection | Original XML, failed extraction/program, selected values and actual error stay available; corrected pair can change both pieces |
| Shared author allowance      | Exhaustion remains unresolved after the existing allowance; no child acquisition or budget reset                                |
| Reuse                        | JSON/XML changed, added and empty references pass AI-free replay; XML namespace-prefix change also passes                       |
| Independent review           | Four roles: Nisc alignment, generic grammar, correctness and quality; no material findings                                      |
| Documentation                | 35 declared package documents and 53 relative links checked                                                                     |
| Unchanged ownership          | All 11 engine files, mechanical JSON helpers, model transport, discovery defaults and lockfile match pre-slice hashes           |

The required live HTTP-only RFC/PDF check also passed: 116,547 bytes, `%PDF-1.5`, 1,417.72 ms execution and 34.85 ms preparation. This is transport evidence only, with no models. Capture: `data/runs/live-pdf-2026-11-02T10-47-37-804Z`.

Isolated package consumption passed using the unchanged recorded-artifact manifest: two historical artifacts, four executions, zero model imports during execution, strict declarations and optional discovery/codec entries checked separately. Evidence: `package.log` and `data/runs/package-LQnVfA/verification.json`; archive SHA-256 `d779a72633a8ad89cd5b1dab0d5f52bc7b29c02c955387569cbf7043d9981112`. This is mechanical package compatibility, not new model accuracy.

Earlier failing offline assertions remain in the evidence logs. They exposed an initially over-strict executable-rule schema (runtime binding intentionally removes embedded mapping data), followed by mismatched test expectations for the existing inspection wrapper. The executable-rule boundary was preserved, assertions were corrected to its actual contract, and the complete final suite passed. No failed model answer or historical discovery was regraded.

## Cost and remaining uncertainty

The paired author receives the full published ConfigSchema within its typed candidate, instead of the bare writer's narrower documented profile. Derived draft-7 schema JSON sizes are 42,392 bytes for the pair, compared with 3,200 bytes for the previous XML author and 28,873 bytes for the previous reference profile combined (32,073 bytes). These are schema bytes, not provider tokens or complete request sizes. The pair offers more pure Prism operators; this does not add native capabilities or execution effects. Fewer handoffs do not establish lower model cost or latency.

A mechanically valid pair can still select the wrong semantic references. Malformed outputs can still exhaust Cortex recovery. The change gives one author ownership of both dependent pieces and the information needed to correct them; it does not prove semantic completeness. A separate, explicitly authorized focused 120b run is the next accuracy check.

Evidence is under `data/runs/xml-reference-pair-offline-2026-11-02`: `saved-failure.json`, `ownership.json`, `schema-sizes.json`, `full-check.log`, `author-wire.log`, `acquisition*.log` and `live-pdf.log`. One-off saved-source checks live only in ignored evidence, not production or package example runners. No new dependency, planner, reviewer layer, persistence or engine machinery was introduced.
