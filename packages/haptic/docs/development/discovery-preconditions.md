# Discovery preconditions

The initial HTML proposal supplies `{preconditions, selector, links, result}` and optional dynamic fields through the source-only inspection/proposal contract. JSON commits a mechanically successful candidate automatically. A later conditions-only correction supplies only `{preconditions}` and preserves unrelated selection. Preconditions are optional in meaning, but the array is required: `[]` declares none.

```json
{
  "preconditions": [{ "selector": "main > h1", "minimum": 1, "maximum": 1 }],
  "selector": "main article a",
  "links": null,
  "result": null
}
```

Each condition independently identifies required page context. Bounds are inclusive; `maximum:null` is unbounded. They must be justified by source structure or the request, rather than the observed result count. An optional requested record may disappear while its page remains valid. Mechanical admission does not prove semantic independence. The final reviewer judges shaped data; it does not certify precondition coverage or future reuse.

## Ownership and execution

The schema lives in `rules.schema.ts`. The shared JSON `precondition-admission` rule rejects inverted bounds and selectors exactly duplicating result/navigation selectors; the fixed JSON source phase returns its diagnostic and narrows mechanical correction to the conditions component, while binding also fails closed. This comparison does not detect equivalent CSS written differently or prove semantic independence. JSON instructions remain in `discovery.json`; the one final-data reviewer remains in `result-review.json`. The separate navigation semantic reviewer is removed. Mechanical trials execute against original sources, not prepared model HTML.

`mechanical.json` owns one static precondition loop in the shared `select` helper. It canonicalizes the current rule's selector/minimum/maximum declarations and deduplicates them, then checks each declaration in order. Both canonical data and the computed failure name use the same field order because installed Prism object equality is order-sensitive.

The artifact stores conditions as literal data. Binding never creates a step per condition or rewrites an expression's internal positions. Different learned conditions produce identical root and helper programs. The regression suite also restructures a static helper output and verifies unchanged success, call order and exact failure identity. Earlier template-generation measurements are historical; see the current [builder grammar](discovery-builder.md).

A matching step calls existing `html.select` and applies existing engine `checks` before result or navigation selection. Its name includes the selector and bounds. A failed condition returns ordinary `status:failed`, `value:null`, with `CHECK_FAILED` and that declaration in the message. Later-page failure does not publish partial output. A caller may use this diagnostic to request discovery again; automatic maintenance and a new runtime status framework are not implemented.

Stage trials and final artifacts use the same bound helpers. The same generic interpreter and mechanical operation registry execute both. No model, database, history reader or additional native planner executes the conditions.

## Limits and verification

Passing conditions means only that their declared assumptions held. It does not prove result correctness or completeness. A frozen version, a new differently named unwanted file, or reordered content can remain invisible when the independent page anchor still exists. Empty conditions offer no additional protection.

`tests/discovery-preconditions.test.ts` binds unchanged saved learned rules plus manually declared conditions through the actual JSON binder. It asserts the expected outcome of each saved case and keeps known silent errors visible. This is offline mechanics coverage, not model authoring accuracy. Separate end-to-end discovery checks verify local mechanical correction, publication and AI-free changed-page failure. A negative verdict can trigger the configured bounded repeat of the fixed author pipeline, with each job receiving its own proposal/observation history and the review feedback. Working artifacts are returned independently of that verdict; callers receive the review separately. Fresh complete mechanical verification remains required. Fresh-model coverage must be reported separately.

The earlier multi-observation and verdict/policy experiment runners, two human-authored procedure artifacts and their superseded standalone test were removed. Original captures, HTML variants, independent expected URLs, raw provider responses and failed-run results remain preserved.

## Recorded integration

Offline: 28 saved-rule/variant executions with manually declared context checks produced four explicit missing-anchor failures, 16 correct results and eight intentionally retained undetected semantic errors. Additional checks cover reordered declaration fields, deduplication within/across stages, exact failure identity, valid empty results, bounds and prevention of partial output/downloads. These numbers measure check mechanics, not model accuracy.

Fresh six-discovery batch: PDF, zlib and 7-Zip twice returned four correct artifacts, one incomplete zlib artifact and one unresolved zlib discovery. The reviewer also accepted a PDF condition copying its result selector. A shared JSON admission rule was then added to reject that exact duplication and inverted bounds. In two focused saved-answer cases, Cortex preserved a valid control and replaced the rejected condition with separate citation_doi metadata; both returned correct artifacts and passed fresh AI-free execution. This was saved-answer recovery, not two new independent discoveries.

Controlled execution of the actual learned 7-Zip artifacts shows both explicit failures and remaining silent errors. A frozen-version guard fails when that version disappears but still permits stale results if the old version remains. A structural guard catches its missing page anchor but permits a stale first-table selection after content ordering changes. No completeness or arbitrary-reuse guarantee follows. The original exact-302 PDF fixture historically failed its required302 expectation against an actual301 response; that failure remains recorded. The current live-PDF contract separately accepts declared bounded redirect behavior and validates terminal PDF bytes. Detailed evidence: `data/runs/preconditions-integration-2026-10-28/verification.json`.
