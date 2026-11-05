# Source-rule and URL-reference boundaries — 2026-11-03

## Outcome

The two approved boundaries are implemented. Fresh Guardian discovery returns ten unique source-supported headline/link pairs and nine descriptions. Fresh Spiegel discovery returns ten supported rows covering nine unique articles, with four descriptions. One article is repeated, and some Spiegel headline strings retain whitespace, timestamps or a live label. The duplicate and formatting are preserved in the recorded output, not silently corrected.

Both requests start from the unchanged original request + URL, use automatically generated schemas, and publish artifacts independently executed against fresh HTTP without AI. No saved answers, manual artifact corrections, saved-page substitutions or production edits between the two cases occurred.

## Contracts and ownership

`docs/plans/source-rule-url-references.md` records the implementation contract.

JSON discovery admission now returns `SOURCE_RULE_EMPTY` when an HTML proposal declares no extraction, navigation or resource action. The same source job receives the failure before schema/mapping work. Its history and remaining allowance remain intact. Navigation-only and resource rules retain permission/task checks; a real learned selector can still execute on empty data. This is not a field-completeness or ten-result gate.

The shipped HTML format entry declares `urlAttributes:["href"]`. Omitted/empty configuration disables projection; there is no hidden TypeScript default. Two ordinary JSON helpers use existing `url.resolve` to add `references.attributes`, dynamic `references.fields` and aligned `referenceErrors` to selected records. The reader's original fields/attributes remain unchanged. Nulls, duplicate references, ordering, base URL and encoding are preserved. Ordinary invalid URLs become null plus diagnostics; cancellation, integrity/resource controls, unexpected failures and the existing legacy-query encoding refusal stay terminal.

The unchanged shared output-source projection carries these enriched records into both captured mapping input and finished execution. The shipped Prism agent remains unchanged; its JSON-owned user context explains the resolved references. The engine, readers, common model adapter and dependencies are unchanged. No new native operation, planner, persistence or acquisition was introduced.

## Offline proof

- The exact saved all-null Spiegel proposal receives `SOURCE_RULE_EMPTY`. Its unchanged later real rule passes in the same remaining budget. HTTP/model effects: zero.
- The unchanged saved Guardian rule resolves all 17 selected field references correctly; the unchanged saved Spiegel rule resolves all 145 correctly. This verifies the actual current stage flow, not a separate URL example runner.
- Controls cover root/directory/absolute references, explicit HTML base, queries, fragments, duplicates, nulls, multiple values, invalid URLs, dynamic aliases, raw-value preservation, zero acquisition and valid empty execution.
- Independent reviewers also exercised dotted/reserved-looking aliases, mixed invalid attribute/field references, cancellation and terminal legacy/error/control failures.
- `pnpm typecheck` and full `pnpm check` pass: 44 TypeScript test modules and 15 benchmark-support tests. The navigation test's manually selected helper list was replaced with the actual composed mechanical bundle. Its behavioral checks remain intact.
- HTTP-only PDF regression passes with the unchanged 116,547-byte RFC PDF, zero models.
- Four independent engineering roles finish at 9/10 with no material findings. Their grades cover ownership/contracts/correctness/quality, not model accuracy.

## Fresh model results

The model settings remain 120b/high reasoning/temperature 1/top-p 1/emit. Both final reviews accept; the independent source checks below supply the result counts.

| Case     | Returned rows | Supported headline/link rows | Unique articles | Supported descriptions | Unsupported rows |
| -------- | ------------: | ---------------------------: | --------------: | ---------------------: | ---------------: |
| Guardian |            10 |                           10 |              10 |                      9 |                0 |
| Spiegel  |            10 |                           10 |               9 |                      4 |                0 |

Spiegel's selected source cards contain a repeated article. Its Prism program takes the first ten rows without deduplicating article URLs. No additional deduplication gate or site-specific fix was added. The descriptions refer to four distinct articles.

| Case     | Actual provider requests | Reported input tokens | Reported output tokens | Discovery + fresh execution | AI-free execution | Artifact preparation |
| -------- | -----------------------: | --------------------: | ---------------------: | --------------------------: | ----------------: | -------------------: |
| Guardian |                        7 |               264,160 |                 14,334 |                    48.584 s |        196.317 ms |            92.690 ms |
| Spiegel  |                        7 |               393,419 |                 11,987 |                    51.807 s |        280.097 ms |            75.357 ms |
| Combined |                       14 |               657,579 |                 26,321 |                   100.390 s |                 — |                    — |

All 14 requests report usage. Actual quota waits: zero. Execution model requests: zero. Execution times include HTTP; preparation is separate. The previous batch used 19 requests, 797,627 input / 58,329 output tokens and 186.093 seconds, returning zero correct Guardian links and five complete Spiegel headline/link pairs.

### What the models actually did

Guardian requested the same article-card inspection twice; JSON reused the latest identical observation. It then proposed its full rule. Its generated output mapping reads the article URL directly from `record.references.fields.articleLink[0]`. It no longer constructs the URL with a base/path concatenation. The other fields remain dynamic source field arrays. No semantic repair was needed in this run.

Spiegel inspected and proposed a real source rule immediately; it did not repeat its saved all-null proposal. The published Prism agent's first program used `$.records`, which failed the real trial because its execution scope is `$.input.records`. Existing JSON mechanical feedback repaired that same mapping job on its next call. The final program copies already-absolute source URL fields; it does not construct URLs. No semantic author-pipeline repeat was needed.

Neither fresh source job proposed an all-null rule. Therefore the no-op boundary is demonstrated by the exact saved-failure replay, not by a claim of live 120b repair of that failure. Source-selector variation between fresh runs remains model-dependent; this batch alone is not a general accuracy guarantee. Source-card association also does not establish universal news-importance ordering.

## Mechanical execution cost

An additional offline comparison used the same saved HTML and source rules with HTTP forbidden. Each old/new selection plan was prepared once, warmed once and run five times alternately. Raw selected values were identical. The median includes HTML parsing and source validation:

| Same source selection                      | Before projection | With URL-reference metadata |
| ------------------------------------------ | ----------------: | --------------------------: |
| Guardian: 33 records, 17 URL field values  |         49.106 ms |                   44.324 ms |
| Spiegel: 160 records, 145 URL field values |         85.064 ms |                   96.167 ms |

The larger case adds about 11 ms. The small case's negative difference is timing noise, not a claimed speedup. No interpreter limit was raised or code-path shortcut introduced.

## Evidence and disposition

Keep this slice. It fixes concrete discovery admission and URL-ownership defects without making useful partial output depend on strict field gates. Spiegel's duplicate/formatting remain visible model-output limitations.

Evidence is under `data/runs/source-boundaries-2026-11-03/`: frozen source/build, unchanged inputs, exact provider requests/responses and decisions, original HTTP captures, generated schemas, emitted artifacts, fresh executions, independent qualifications, saved-failure/control outcomes, selection timing samples and offline/PDF logs. All earlier failed evidence remains intact.
