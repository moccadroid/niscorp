# Schema-authoring boundary correction

Status: implemented and reviewed. Full offline checks, typecheck, isolated package and mechanical live-PDF checks passed. Four integration roles graded the code/contracts 9/10; modest findings were fixed. No engine, Cortex, dependency, transport or provider-setting changes. No wider discovery batch.

Closing evidence: `data/runs/schema-authoring-boundary-2026-11-01T16-07-32-017Z/verification.json`. The frozen model panel at `data/runs/schema-authoring-models-2026-11-01T16-19-29-925Z` admitted all five schemas on their first requests: 3,773 input/14,363 output tokens in 34.777 seconds, no waits or manual corrections. This is a presentation/format improvement, not end-to-end proof: SQLite proposes a complicated nested representation, Meetup normalization is untested, and real-model generated-contract revision has not run. The prior full discovery panel remains 5/10. Exact schemas, complete requests and raw responses are retained with the panel.

## Evidence and problem

The exact PostgreSQL requests 44–46 in `data/runs/contract-e2e-models-2026-11-01T15-09-56-847Z` show the model copying the recursive response grammar's internal references into the ordinary schema it must author. Cortex rejects these keys correctly. Eleven offline controls agree between the captured wire grammar and Zod; see `data/runs/schema-boundary-analysis-2026-11-01T15-50-24-574Z`. Syntax recovery already works. The same full panel contains a wrong generated SQLite interpretation and a reviewer false acceptance; presentation correction cannot certify those semantics or Meetup completeness.

## Contracts and owners

- Keep the existing ordinary JSON Schema body vocabulary and strict Zod validation. No new emitted shape DSL, inferred example schema, native planner or universal documentation framework.
- The schema-author operation uses Cortex's existing `output.doc`. Its small authoring view derives form structure and descriptions from the same owning grammar. JSON supplies presentation wording and placeholders. Do not maintain a second handwritten grammar or expose export-only recursive scaffolding.
- Result-contract JSON owns instructions, documentation policy, dialect stamping, candidate compilation and feedback. Its input no longer includes the selected adapter or native extraction representation. It designs requested values, not reader arrays.
- Caller schemas remain immutable and compile before model or HTTP work. Task declaration remains action-only and is not rerun during repair.
- Generated schemas are proposals before publication. Existing JSON semantic repair may revise them together with selection/mapping; published artifact schemas remain fixed during execution.
- Shared final review receives explicit caller/generated origin in its existing context. Original instruction governs generated meanings. Caller schema requirements remain authoritative. No new reviewer or semantic layer.

## Bounded revision

Keep the existing single outer semantic-repair eligibility policy. If that repair is needed, caller mode skips schema generation. Generated mode may call the existing result-contract helper with previous schema and concrete rejection only; selected output values do not enter contract authoring.

Reuse `model-allowance` with aggregate consumed metadata from initial contract attempts. Total consumed steps and time are sums; aggregate outputRetries is sum of per-run retries plus the number of runs minus one. Remaining candidate count is the configured count minus initial attempt count. Missing metadata conservatively prevents another schema call. Never reset contract step/output/time/candidate budgets at the outer boundary.

If allowances are exhausted, skip schema revision and retain the existing selection/mapping repair using the initial schema. If a revision is attempted but invalid, stop that repair before new extraction/mapping or publication; do not fall back to a rejected artifact. A valid revision still requires ordinary extraction, Prism shaping, final review and complete mechanical trial. No third semantic attempt.

Retain initial `contract`, rejected `first`, optional `repairContract` and optional `repair` diagnostics. Report the effective revised output schema once a revision is admitted, even when subsequent extraction fails. A published artifact, its reported schema and final review must agree. Caller instruction/action/asOf/permission ceilings and initial capture remain unchanged.

## Required checks

1. Every grammar form and recursive combination remains supported; dynamic names remain dynamic. Unsupported keys are rejected by the same validator.
2. Actual Cortex-visible authoring messages use the derived view, omit internal export references, preserve emit and settings, and allow Cortex's own recovery.
3. Schema model context has no adapter/native-value instructions, source capture, selected values or saved expected answers. Repair sees only instruction, previous schema and rejection.
4. A generated scalar/array contract can become a different ordinary contract within existing repair, with matching final artifact schema and AI-free changed-value execution.
5. Caller schema repair invokes no schema model and cannot rewrite caller contract; invalid caller schema still fails before effects.
6. Step/output/time/candidate exhaustion prevents extra schema calls; missing metadata does not grant allowances. Existing selector/mapping repair remains possible without revision.
7. Invalid revision, rejected second review, failed fresh trial or cancellation cannot publish or fall back. Retain evidence and preserve ceilings.
8. Run typecheck, complete offline checks, isolated package check and the required HTTP-only PDF check. Compare all engine source hashes and installed dependency identities with the pre-change snapshot.

## Review and model evidence

Independent NISC alignment, grammar, correctness and quality reviews occur at integration. Fix modest findings and verify normally; repeat reviews only for material redesign or unresolved risk.

Then freeze code/workflow/settings/suite and run the same five schema-generation instructions once each through the production result-contract flow. Retain all requests/raw responses and automatic recovery; no hand corrections. Report admitted schemas separately from semantic fit, usage coverage, actual quota waits and time. This schema-only panel cannot update the earlier full discovery 5/10 result or establish end-to-end improvement.
