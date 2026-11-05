# Test architecture audit — 2026-11-03

## Scope and decision

Audit and remove tests that enforce implementation choices instead of the approved JSON artifact → in-memory execution → result contract. Production source, engine, dependencies, model settings and historical evidence remain unchanged. No paid model tests or new live acquisitions were run.

Three independent read-only audits covered discovery/builder tests, interpreter/acquisition tests, and search/benchmark grading. Their consistent finding: retain meaningful mechanical contracts, remove implementation snapshots, and stop treating scripted model integration as discovery accuracy.

The audit reviewed all 44 TypeScript test files present at its start. One was deleted, 17 revised and 26 retained. The remaining runner imports 43 files. Full per-file reasons are in `data/runs/test-architecture-audit-2026-11-03/inventory.json`.

## Removed targets

- Deleted `schema-authoring-presentation.test.ts`: custom grammar rendering and prompt wording do not prove that a model authors the right schema. Actual schema validation, data/response-schema separation and Cortex recovery remain tested.
- Removed private root/helper-program equality, helper-name presence, step layout, exact internal job sequences and incidental call counts. Retained real execution results, configured budget assertions and absence of repeated effects.
- Removed assertions that repair must use the `selection` or `processing` partition. The tests must not make a particular repair route permanent, especially when a narrow route can leave the actual extraction broken.
- Removed presentation labels, report key ordering, a retired-property check and incidental serialized-HTML equality. Retained source values, structure, ownership, omissions, actual feedback and cancellation.
- Deleted DOM-path and selected-element-content-hash grading. Linked-page checks now compare independent final data, resource checks compare actual bytes, and grades label resource-only scope. Neither a schema nor a selector is an independent final-answer expectation.
- Deleted `scripts/check-discovery.mjs`. It intercepted retired prompt headers, expected old artifact/repair layouts and could optimize for native selection instead of requested data. It is not retained behind an alias or disabled wrapper.
- Replay now rejects missing independent grading contracts before execution/HTTP. Sixteen original 17-task entries lack final-data expectations; the task list remains evidence/input, not a valid current 17-task accuracy suite. The remaining Django news contract has independent data expectations. Other format/resource suites retain their independent data/download contracts.
- Search-run summaries now call the count `mechanicallyReadySources`. The public search response is unchanged; mechanical source readiness still does not measure relevance or useful results.

Controlled model replies remain useful for integration, permissions, feedback, budget and cancellation tests. They do not measure model intelligence. The runner now states this explicitly. Updated test standards live in `docs/development/style-guide.md`.

## Guardian and Spiegel: actual regression, not website drift

Six offline artifact executions used the current engine and only the original saved HTTP captures. Unknown acquisitions were prohibited; zero HTTP network requests and zero model calls occurred. Headline/link associations were checked against their source cards, separately from mechanical completion.

| Site     | Artifact                  | Saved pages       | Supported headline/link pairs | Supported descriptions |
| -------- | ------------------------- | ----------------- | ----------------------------: | ---------------------: |
| Guardian | Earlier useful artifact   | Earlier           |                            10 |                      4 |
| Guardian | Earlier useful artifact   | Latest failed run |                            10 |                      4 |
| Guardian | Latest generated artifact | Latest failed run |                             0 |                      0 |
| Spiegel  | Earlier useful artifact   | Earlier           |                            10 |                      7 |
| Spiegel  | Earlier useful artifact   | Latest failed run |                            10 |                      9 |
| Spiegel  | Latest generated artifact | Latest failed run |                             0 |                      0 |

The current Guardian artifact returns homepage metadata. The current Spiegel artifact returns an empty array. Both execute mechanically; neither satisfies the news request. Older artifacts still produce useful current-page data on those identical newer captures, so the reader/engine and absence of source data do not explain the regression.

The initial comparison used the nearest heading-containing ancestor to verify descriptions. That scope was too small for some Spiegel descriptions still inside their article. The preserved initial checks were corrected using the original saved-run article association contract; the 10 supported headline/link pairs were unchanged. This correction and its reason remain in the detailed replay records rather than silently turning the first check into evidence.

### Exact first source-author context comparison

These are bytes in the model's HTML context message, including its source/window metadata, not tokens and not total request size.

| Site     | Earlier context bytes | Body/main present | Latest context bytes | Body/main present |
| -------- | --------------------: | ----------------- | -------------------: | ----------------- |
| Guardian |               195,101 | Yes               |                9,916 | No                |
| Spiegel  |               432,746 | Yes               |                9,111 | No                |

The current fallback takes the first 32 matches of `*`. On these pages the small head fits that window while the body does not reach the initial model view. The tests used early useful records or an oversized head and asserted that some HTML was delivered. They did not establish that ordinary head-heavy real pages expose useful record containers.

The earlier runs used different, more aggressive preparation profiles. Guardian cleared several container interiors; Spiegel also cleared class/title and some attribute prefixes. Blindly restoring those profiles would remove potentially requested metadata or selector evidence. The comparison establishes loss of useful initial evidence, not a controlled causal proof that one prompt or clearing rule alone explains every failed model choice.

The saved responses reveal a second concrete failure: Spiegel's initial navigation-only proposal retained `selector:null`; the next job could correct only navigation. It then observed actual articles but returned `links:null`, leaving no extraction. Its later repair also exhausted Cortex recovery by repeatedly using the wrong response field. This is a discovery correction failure, not a Prism transformation or engine failure. Guardian repeatedly used absent old selectors and ultimately selected the head; its reviewer rejected the result without inspecting the body.

## What passing checks establish

They protect the interpreter, schemas before effects, original-source integrity, owned model evidence, caller false/zero limits, dynamic fields, changed/added/empty values, actual local transport, redirects/resources, cancellation, feedback history, partial working artifact retention and execution without AI. They do not establish source relevance, semantic completeness, fresh discovery success or future reuse on arbitrary layouts.

The current live acceptance result stays **0/2 useful news discoveries**. Deleting wrong tests does not fix those discoveries. The older partial news results remain useful; missing descriptions should be reported as missing, not used to suppress supported headlines and links.

## Recommended next work, not implemented here

1. Establish the news request outcomes before editing discovery: source-supported article headlines and associated links, available descriptions, duplicate/wrong/missing records, and useful partial versus complete output. Keep automatic schemas and caller schemas distinct. These are internal verification expectations, not caller approval requirements or production site rules.
2. Correct HTML evidence selection in the existing JSON preparation/context step. Supply meaningful document content plus necessary metadata, with explicit omissions and existing inspection for overflow. Do not choose an arbitrary first-32-element prefix and call it sufficient evidence. Check actual author and reviewer messages on these saved pages and metadata-based download controls before any paid run.
3. Simplify source correction so a bad navigation choice cannot restrict a job to repairing navigation while its extraction remains null. Keep the same fixed pipeline and source ownership; return the current source rule, actual failure and permission ceiling to the source job. Do not introduce a universal planner, site routing or a new reviewer gate.
4. Freeze code/profile/requests, then run one fresh Guardian and one fresh Spiegel discovery and independently execute their artifacts without AI. Judge the returned records against each run's actual captured pages, report partial quality, requests, tokens and time, and compare with the earlier useful results. No manual artifact corrections or saved-page substitution in those live runs.
5. Only after that recovery, rebuild independent final-data contracts for the broader task list and run a wider batch. Do not tune production against the retired node-path scores.

## Evidence

Final verification: `pnpm typecheck` and `pnpm check` pass. The latter builds the package, imports all 43 remaining TypeScript test files and passes all 15 benchmark-support tests. All 78 production source-file hashes match the start of the audit. Six saved-artifact executions completed with zero external HTTP/model calls. These passing checks do not alter the failed fresh-discovery verdict above.

Audit outputs: `data/runs/test-architecture-audit-2026-11-03/` contains the inventory, source hashes, offline logs, exact context comparison and six saved-artifact executions. Original useful runs remain under `live-theguardian-top10-links-2026-11-03` and `live-spiegel-top10-final-2026-11-03`; failed live runs remain under `live-news-evidence-2026-11-03`. No historical run was overwritten.
