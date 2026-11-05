# Source-grounded discovery: offline coverage replacement

This records test ownership during the approved source-grounded discovery replacement. These are controlled protocol/mechanical tests, not fresh model accuracy measurements. Historical source captures, failed model trials and measurements remain unchanged.

The engineering checks subsequently passed, but the frozen model comparison **rejected the candidate**. Baseline completed seven of ten core cases and neither resource chain. Candidate attempted two cases and returned no artifacts because output authoring repeatedly emitted answers instead of programs; the gate stopped the other ten. This coverage map does not overturn that failed outcome. Exact measured analysis is in the repository at `docs/measurements/source-grounded-discovery-2026-11-01.md` and under `data/runs/source-grounded-comparison-2026-11-01T18-51-04-225`.

## Removed obsolete test machinery

The old integration servers recognized the retired one-shot prompts and returned bare HTML/XML/Prism candidates. Their expectations required whole-tree restart, per-component attempt allowances, or the removed navigation semantic reviewer. Keeping those fixtures would test an implementation that no longer exists.

Removed files:

- `discovery.test.ts`, `json-discovery.test.ts`, `xml-discovery.test.ts` and `reference-following.test.ts`: replaced with actual public-workflow action-protocol integration tests.
- `result-contract.test.ts` and `generated-contract-repair.test.ts`: their old contract timing, per-component budgets and whole-tree repair expectations were retired. Automatic/caller schema ownership, order, syntax admission and bounded final repair are covered by the new tests and retained schema/wire tests.
- `html-review.test.ts`: the separate navigation semantic reviewer was explicitly removed. Its native navigation facts survive in `navigation-facts.test.ts`; final-data review has its own retained tests.
- `discovery-decisions.test.ts` and `source-trial.test.ts`: their unused `qualify-trials`/`bind-source` helpers were retired. Current readiness, source-stage observations, source identity, ordinary-versus-captured execution, resources and cancellation are tested through the production source-grounded path and captured-trial suites.

No compatibility aliases, retired profile fields or legacy model-operation adapters were introduced to keep those tests green.

## Producer-to-consumer coverage

| Invariant                                                                                                                                   | Current test owner                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTML proposal → actual observation → finish → shaping → final review → fresh mechanical trial                                               | `source-grounded-discovery.test.ts`                                                                                                                         |
| Conditions-only repair preserves useful selection                                                                                           | `source-grounded-discovery.test.ts`                                                                                                                         |
| Automatic schema after grounded source observations; caller contract unchanged and admitted before effects                                  | `source-grounded-discovery.test.ts`                                                                                                                         |
| Premature ready, unknown source, shared model budget and terminal fresh-trial failure                                                       | `source-grounded-discovery.test.ts`                                                                                                                         |
| Reconsideration requires changed candidate or new successful source evidence; repeated candidate/query cannot buy another verdict           | `source-grounded-discovery.test.ts`                                                                                                                         |
| HTML/JSON/XML artifact execution on changed values and added records, without execution AI                                                  | `source-grounded-discovery.test.ts`, `source-grounded-acquisition.test.ts`                                                                                  |
| Default-disabled permissions, unavailable actions, false/zero caller overrides and malformed request fields                                 | `source-grounded-acquisition.test.ts`                                                                                                                       |
| Five destinations, two depths, BFS order, shared target ceiling, explicit limiting, cycles and alias deduplication                          | `source-grounded-acquisition.test.ts`                                                                                                                       |
| JSON scalar/string/null/false/zero identity and empty results                                                                               | `source-grounded-acquisition.test.ts`, retained final-review wire controls                                                                                  |
| XML namespace URI binding survives prefix changes, changed/added entries and empty XML collections                                          | `source-grounded-acquisition.test.ts`, unchanged `xml.test.ts`                                                                                              |
| JSON/XML → linked HTML → PDF, changed/added/empty references and separately bounded resource bytes                                          | `source-grounded-acquisition.test.ts`, unchanged mechanical resource/source-trial controls                                                                  |
| Unsupported formats, heterogeneous frontiers, caller time, mutable request ownership and cancellation                                       | `source-grounded-acquisition.test.ts`                                                                                                                       |
| Current source trials, ordinary-versus-captured execution, URL identity, permissions, resource bounds/status/bytes and cancellation         | `source-grounded-discovery.test.ts`, `source-grounded-acquisition.test.ts`, `captured-trial.test.ts`, `captured-assembly.test.ts`                           |
| Across-page/per-page minima, fields, overlap and independent context conditions                                                             | `authoring-checks.test.ts`, `author-diagnostics.test.ts`, `discovery-preconditions.test.ts`; their helper calls current `html-candidate-admission` directly |
| Native navigation match counts versus collected URLs, duplicate/seen targets and explicit permission/collection limits                      | `navigation-facts.test.ts`                                                                                                                                  |
| Task/action admission and immutable strict two-field task vocabulary                                                                        | Preserved `task-result.test.ts`                                                                                                                             |
| Untested/failed proposals cannot advance; empty source selections, mixed failures and cancellation remain explicit                          | `source-grounded-discovery.test.ts`, `source-grounded-acquisition.test.ts`, `source-inspection.test.ts`, `captured-trial.test.ts`                           |
| Prepare once for many trials, malformed-artifact admission before effects, audit failures and outcome ownership                             | Preserved `builder-ownership.test.ts`                                                                                                                       |
| Ordinary schema grammar, full Cortex wire distinction between response and result schemas, scalar source/value identity and Cortex recovery | Preserved `result-review-boundaries.test.ts`, `schema-authoring-presentation.test.ts`                                                                       |
| Action schemas, wrapper documentation and scoped prepared-HTML view                                                                         | `author-actions.test.ts`                                                                                                                                    |
| Reader/transport/parser/engine/Strata/static-binding contracts and known frozen-value counterexamples                                       | Existing independent reader, transport, engine, binding, admission and reuse regression suites                                                              |
| Search composition and query rewriting                                                                                                      | Existing `search.test.ts`, `search-loop.test.ts` and preserved search rewrite ownership controls                                                            |

## Evidence limits

The new integration fixtures queue model actions and supply native HTTP captures. They test JSON-owned branching, admission, execution and publication; they do not establish that 120b chooses useful actions or repairs real mistakes.

Old assertions about exact prompt headers, number of one-shot calls, the old `first`/`repair` response wrapper or mandatory whole-tree reauthoring were intentionally removed. Model settings, emit recovery and source/result separation continue to have independent wire tests.

This map is not a claim that every old test case has an identical replacement. The retained independent mechanics plus the new producer-to-consumer invariants are the required regression boundary. Additional cases must address an actual missing invariant, rather than restore an obsolete internal topology. The checkpoint reviews and complete offline run decide whether this coverage is sufficient before any candidate paid comparison.

Local-provider wire checks need loopback access. A restricted execution that cannot connect to its temporary test server is an environment failure; it must not be repaired by changing the model protocol or expectations. Run those checks with the ordinary test host permissions.
