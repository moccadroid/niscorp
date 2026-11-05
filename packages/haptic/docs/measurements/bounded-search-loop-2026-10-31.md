# Bounded search loop — offline evidence

This slice changes search orchestration only. No fresh discovery/model accuracy is claimed. The engine is unchanged against the eleven-file hash baseline saved before this slice under `data/runs/bounded-search-loop-2026-10-31/baseline.json`.

## Ownership and behavior

`src/search/search.json` composes search acquisition/relevance, one destination attempt, qualification, bounded rewriting and continuation. `src/search/default-profile.json` owns defaults and rewrite instructions. The TypeScript profile schema only renames `minRelevantResults` to `minSuccessfulSources`; no alias remains. The live driver's summary also exposes `successfulSources`.

`maxFollowResults` counts every attempted normalized destination URL across all queries, including failures. `minSuccessfulSources` counts existing published artifacts with reviewed/validated discovery, completed final trials and applicable output. Without a caller output schema, empty HTML/data outputs do not count; selected records, nonempty structured data or fetched resources can count. Caller-shaped false and zero remain valid. This qualification uses existing evidence, not a completeness oracle or another semantic review.

A failed destination can trigger the existing query-rewrite flow only while rewrite allowance and follow slots remain. New-query candidates precede older unvisited candidates. Attempted URLs are never retried. A valid null rewrite consumes one rewrite allowance and leaves fallback candidates available. Reaching the configured minimum stops destination work. Exhaustion preserves partial results with `insufficient:true`. A zero minimum performs no acquisition.

Destination feedback includes existing status, author/review/trial errors and review verdicts. Source HTML, artifacts and usage bodies are not copied into rewrite context. Unresolved authoring is not evidence that the source contains nothing useful. Search-provider challenge/unknown-layout failures, cancellation and evidence failures remain terminal.

## Saved outcomes and controlled checks

The portable fixture `tests/fixtures/search/saved-outcomes.json` contains the ten original search candidates/Jev answers and five unresolved destination outcomes from `search-connected-2026-10-31T12-36-46-880Z`, plus the published Meetup artifact/final trial from `search-connected-2026-10-31T12-06-20-223Z`. Original run evidence is unchanged.

`tests/search-loop.test.ts` executes the production JSON loop with controlled search/relevance/destination effects. Query rewrites are explicit controlled responses. The saved successful artifact and its trial output remain unchanged; the test does not claim that a fresh model would find or reproduce them.

| Offline scenario                                                   | Destination attempts | Controlled rewrite responses | Qualifying sources | Outcome                                                                      |
| ------------------------------------------------------------------ | -------------------: | ---------------------------: | -----------------: | ---------------------------------------------------------------------------- |
| Same five saved failures; rewriting disabled                       |                    5 |                            0 |                  0 | Insufficient; previously the recorded search incorrectly reported sufficient |
| Saved failure, then controlled query yielding saved Meetup success |                    2 |                            1 |                  1 | Stops at minimum; saved artifact/trial preserved                             |
| Saved success before lower-ranked fallback                         |                    1 |                            0 |                  1 | Stops without another destination or rewrite                                 |
| Null rewrite, three-attempt cap                                    |                    3 |                            1 |                  0 | Uses fallback; no repeated null rewrite                                      |
| Two rewrites through an empty query round                          |                    2 |                            2 |                  1 | Three query rounds; no phantom destination or allowance reset                |
| Rewritten query repeats an attempted URL                           |             3 unique |                            1 |                  0 | Duplicate skipped; fallback remains                                          |
| HTTP failure consumes the last slot                                |                    1 |                            0 |                  0 | No rewrite without remaining follow capacity                                 |
| One successful source but required minimum two                     |                    2 |                            0 |                  1 | Partial result retained; insufficient                                        |

Additional controls cover failure feedback, unchanged caller permissions and page/resource bounds, empty/native/shaped/resource outputs, malformed/retired inputs before acquisition, and terminal challenge/evidence/cancellation outcomes. Every completed test asserts that destination outcomes and attempted selections have equal length.

Four independent checkpoint roles reviewed alignment, grammar, correctness and code quality. They identified a phantom skipped outcome on empty candidate rounds, stale empty-search test coverage, nested JSON lookups and minor documentation/test labels. These were corrected. No new architecture or repeated review cycle was required.

## Limits

Final verification passed: 13 focused offline cases, `pnpm typecheck`, the complete `pnpm check` suite and the HTTP-only live PDF check (116,547 bytes, no models). All eleven engine hashes match the baseline. The four checkpoint grades were 9/10 after modest corrections. Machine-readable evidence and check logs are under `data/runs/bounded-search-loop-2026-10-31`.

These tests establish bounded control flow and honest sufficiency reporting. They do not repair the five saved authoring failures, prove better query choices from 120b, or establish a new live success rate. No paid calls were made. A focused fresh search remains the next way to measure whether outcome-informed rewriting improves actual results.
