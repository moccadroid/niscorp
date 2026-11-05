# Discovery contract refactor

Status: implemented and independently reviewed; full offline verification, isolated package checks and the HTTP-only PDF check passed. Engine and model settings remain unchanged. No paid tests in this slice. Closing evidence: `data/runs/discovery-contract-refactor-2026-11-01T13-41-24-553Z/verification.json`; individual review findings and fixes: `reviews.json` in the same directory. Historical paid accuracy remains 2/10 until fresh-model verification.

## Baseline and problem

The frozen real-model batch at `data/runs/result-contract-models-2026-11-01T12-11-11-773Z` contains ten direct-URL discoveries on original saved HTTP captures. It published three artifacts; only the two XML runs delivered correct data. GitHub returned an incorrect empty array. Four source-correct SQLite/PostgreSQL candidates were rejected. Automatic declaration produced unsupported schemas, malformed envelopes and an unnecessary nested contract. Raw requests, provider bodies, schema attempts, candidates and independent expectations remain unchanged.

These failures concern model-facing contracts and acceptance, not evidence that the interpreter needs replacing. Offline checks in this refactor prove boundary ownership and protocol behavior; they cannot establish improved model accuracy.

## Responsibilities

| Owner                         | Responsibility                                                                                                            | Does not own                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Task declaration              | `{requiresNavigation,resultFlow}` under caller ceilings                                                                   | Result schema design                                                                    |
| Result-contract JSON flow     | Preserve caller schema, or request a supported ordinary JSON Schema body and mechanically attach the fixed engine dialect | A second schema DSL, current values, selectors, permission changes                      |
| Format adapters               | Acquisition, evidence preparation, extraction and existing Prism input contracts                                          | Different semantic acceptance standards                                                 |
| Generic candidate/trial flows | Compile and execute proposals, retain failures, apply existing bounded repair policy                                      | Semantic truth or hidden native retry callbacks                                         |
| Result-data review            | Judge unchanged instruction against actual shaped data and matching original-format source evidence                       | Revalidate schema syntax, judge traversal wrappers as data, author replacement programs |
| Engine                        | Execute admitted artifacts mechanically                                                                                   | Discovery, models, semantic repair                                                      |

Workflow choices, prompts, capability descriptions, branches and repair policy remain JSON. TypeScript supplies generic operations, typed boundaries and composition. No website/business fields, database, persistence or new planner/compiler.

## Result-contract resolution

1. Caller input and an optional caller schema are admitted before model calls or HTTP. A caller schema wins unchanged, including supported local references.
2. Task declaration returns only its original two-field action contract. Remove `TaskContractSchema` and schema-related task prompts/context.
3. Acquire the initial source and classify its format through the existing JSON flow. This is an explicit sequencing change: automatic declaration failures may now consume the initial acquisition, but cannot proceed to authoring, onward acquisition or publication.
4. If the caller supplied a schema, skip the schema model entirely. There is no null sentinel sent to that model.
5. Otherwise the separate result-contract flow receives the unchanged instruction, URL, optional time reference and the selected adapter's declared extraction capabilities. It does not infer a contract from a generated candidate or its selected values.
6. The model authors a small supported subset of ordinary JSON Schema: object properties/required names/additional-properties choice, arrays, scalar types and unions for optional/null values. Names remain dynamic. Model-facing Zod types describe this grammar; arbitrary JSON objects, `$schema`, `$ref`, `$defs`, recursive definitions, current-value enums and custom keywords are not offered by automatic authoring. This restriction concerns automatic authoring, not existing caller-schema support.
7. A JSON step attaches the fixed 2020-12 dialect. Existing generic artifact compilation admits the schema before extraction authoring. Invalid proposals use the existing candidate feedback loop; Cortex retains ownership of response-envelope recovery. Add a JSON-profile `candidateAttempts.contract` allowance; do not reset budgets through native callbacks.

Capability text and the fixed dialect belong to `result-contract.json`, not the runtime format catalog or finished artifact's acquisition policy. They must describe actual generic adapter capabilities and avoid task/site examples.

The model adapter/provider/settings stay unchanged. A small `json.encode` mechanical operation supplies exact JSON wire text where string coercion would lose scalar identity; it does not shape data or make policy decisions. `review-evidence` is an ordinary JSON helper that uses this encoder only for native JSON and preserves HTML/XML strings.

## One final-data review boundary

The review input names distinct roles explicitly:

- `resultDataSchema`: contract for the shaped value, already checked mechanically.
- `dataToReview`: that value alone, not `{data,visited,limited}`.
- `sourceEvidence`: matching captured evidence tagged by format. HTML remains prepared HTML text, JSON remains native parsed values, XML remains original XML text.
- Unchanged instruction/time reference and separate caller-limit/truncation context.

The fixed reviewer response remains `{accepted,reason}`. Its own response schema is explicitly different from `resultDataSchema`. Prompts ask for source-supported correctness, relevance and concrete omissions, not a second structural/schema verdict. The reviewer never supplies selectors or actions. Navigation review remains separate progress review for HTML stages.

HTML, standalone JSON and standalone XML all apply the same final-data acceptance boundary. Evidence and shaped data must come from the same admitted captures. Semantic acceptance precedes the fresh complete mechanical URL trial. Publication needs both. Redirect/resource bodies never enter review; resource bytes and metadata remain outside result.data and retain existing whole-execution mechanical contracts.

Reference-only JSON/XML frontiers participate too, with original-format evidence from every learned frontier. An empty HTML-document collection cannot bypass review. Successful public status is `reviewed` for every format; `validated` remains an internal mechanical status. Combined source evidence must fit existing `maxInputBytes`; failure is explicit without sampling.

Use the existing `shape-output` helper for pure sample shaping. Factor the current `output-shaping` wrapper into the shared review/complete-trial boundary consumed by each adapter, without duplicated whole execution. Keep one outer semantic repair under existing JSON policy, preserving action, caller schema/effective schema, ceilings and initial source. HTML repair can change selectors and mapping; standalone JSON/XML repair follows their existing authoring paths. Invalid review, rejected repair, cancellation and failed complete trial cannot publish. Retain both attempts and all raw trials. Do not add a failure classifier, retry router or another judge.

## Deletions and preserved behavior

- Delete the combined task/schema model output and associated null semantics.
- Delete the task-specific schema compilation probe; the contract candidate owns it instead.
- Replace the HTML-only final-review contract and wrapper-shaped review input. Keep the actual HTML navigation-review capability.
- Remove standalone JSON/XML publication that bypasses semantic review, and stale output-schema/no-schema branches or aliases.
- Preserve strict URL-only finished inputs, dynamic fields, Prism programs, caller permissions, capture alignment, bounded resource handling and all original evidence.
- Do not edit engine files, dependencies, model adapter/settings, transport or reader mechanics.

## Falsifiable offline checks

1. Supplied schema survives unchanged and schema-author requests are zero. Invalid caller schemas fail before models/HTTP.
2. Task author receives no schema-design responsibility; its strict two-field answer is sufficient.
3. Automatic schema requests have no caller-null ambiguity. Offered output grammar rejects bare property dictionaries, foreign dialects/definitions, undeclared keywords and malformed node shapes. Unrelated dynamic fields/types remain supported.
4. Generated schema is ordinary admitted JSON Schema with mechanically attached dialect. Invalid declarations cannot reach extraction authoring; exactly the initial acquisition may precede them.
5. Review receives actual shaped data separately from metadata; its own response schema and data contract are unambiguous in complete serialized prompts.
6. Each format uses one generic verdict path. JSON receives native root data; XML/HTML receive original/prepared strings from the same capture used by trials. Encoded HTTP body envelopes, resource bodies and redirect bodies never enter model context; original document content intentionally does. Complete Cortex-visible messages, including its own generated response schema, must be captured and checked.
7. Controlled rejection of a wrong empty JSON result blocks publication. Correct scalar, null and empty values remain possible when supported by instruction/evidence. Do not add a blanket nonempty rule.
8. A positive verdict alone cannot publish: mapping/sample checks and fresh complete trial must pass. Invalid/rejected review, failed trial and cancellation remain terminal for publication.
9. Existing bounded semantic repair preserves action, schema and ceilings and retains failed attempts. No manual corrections or model operations in finished artifacts.
10. Saved correct SQLite/PostgreSQL candidates, wrong GitHub candidate, unrelated Vienna candidate and XML controls exercise actual serialized production review input offline. These are protocol/source checks, not claimed new semantic model verdicts.
11. `pnpm typecheck` and full offline `pnpm check` pass. Engine source hashes and model/profile setting values match the pre-refactor snapshot.

## Review checkpoints

First review this specification for ownership, genericity and scope. Implement each boundary with focused offline tests; do not run four reviews after every small edit. At integration, use four independent roles: NISC alignment, generic grammar/contracts, correctness/source alignment and code quality. Review complete captured model-visible prompts as well as code. Fix modest findings and verify normally; re-review only material redesign or unresolved risk.

Only after offline verification and review should a separately authorized paid evaluation test the saved reviewer cases and automatic declarations independently. Repeat the complete frozen ten-run panel only after those focused model checks justify it. No architectural grade is a model-accuracy result.
