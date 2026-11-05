# Current status

This document owns the current engineering and evidence summary. Dated measurements remain historical records; they are not alternate current release claims.

The [final handoff record](../measurements/haptic-handoff-2026-11-05.md) identifies implementation commit `37527db8c3bff85848b7d4372f2ca66e072b6b4f`, the completed 57-module/33-check clean-copy verification and the independent engineering review conclusions. That dated checkpoint preceded the authorized Nisc integration. Haptic now lives in `packages/haptic` as private `@niscorp/haptic@0.1.0`; publication remains separate. See [Nisc integration](nisc-integration.md).

## Product contract

Haptic turns a request for internet information into a reusable JSON artifact. Discovery may use models; finished artifacts read current sources through the in-memory engine without model credentials, database or mandatory persistence. Fields and output schemas follow the request. Scheduling, notifications, storage and downstream AI belong to callers.

HTML, native JSON and original XML/XPath are supported. Prism shapes extracted values; Strata stamps the artifact grammar. Navigation/download permissions and ceilings are explicit caller/profile data. Search acquires the first DuckDuckGo page and invokes the same destination discovery pipeline.

## Source ownership — 5 November 2026

The source/traversal refactor removes whole-root pass-through from the remaining source jobs. A source job receives one current level, its materialized frontier and explicit configuration/authority/author allowance/history. It returns only `{level,part,feedback,allowance,histories,reason}`. Source request/inspection/trial helpers use narrower closed contracts. Acquisition returns its owned capture/document/current-level changes; advancement returns only `{depth,frontier,hasNext}`. Traversal has a closed acquisition/level/frontier frame and only the author allowance. Root retains reviewer/output/last-working state and merges traversal results explicitly. The redundant `frontier-sources` wrapper is removed; `level-sources` receives only level/owned/captures, and the job reuses its materialized frontier.

The actual before/after trace is identical across 787 events: 95 public outcomes, 447 controlled model inputs with exact message strings/settings, and 245 recorded top-registry HTTP-operation inputs. These frozen offline controls cover the existing public pipeline and its original behavior assertions; they are not new paid calls or semantic accuracy evidence. New boundary checks reject foreign root/reviewer/output fields before effects and prevent a source job from returning a draft as success or overwriting another owner's values. Independent capture and feedback checks preserve exact source identities/indices/original bytes, one-request reuse and active rejection/history behavior.

Evidence is under `data/runs/source-ownership-refactor-2026-11-05/`. Final full-suite, clean-copy/package and HTTP-only PDF verification is recorded there separately. The fixed pipeline, model prompts/defaults/settings, execution grammar and engine remain unchanged; no new DSL, native planner, model experiment, Nisc move or publication is part of this refactor. Historical results and accepted best-effort limits below remain dated evidence.

## Cleanup audit — 5 November 2026

Independent execution, discovery/Nisc and code-quality reviews found late host-policy validation, lost working search results after optional continuation failure, and package verification that required private historical run paths. Discovery now admits the existing strict HTML-preparation policy and checks configured CSS syntax before model/HTTP effects. Search similarly checks its configured provider selectors before acquisition. These are mechanical host-configuration checks, not native task decisions.

The existing JSON search loop now retains already obtained usable artifacts if an optional rewrite or later search acquisition/ranking fails ordinarily. `continuationError` reports the phase and failure; no usable result still fails, and cancellation/integrity/resource controls remain terminal. Search follow/rewrite limits and destination allowances are unchanged. Ancestor-field selectors now share the same strict compiler at admission and matching; invalid relative ancestor selectors receive normal selector feedback even when no records match. Ordinary relative descendant queries remain supported.

The package check defaults to repository fixtures preserving two independently graded original artifacts and expected outcomes; it needs no private history input. The package check and two evidence-recording tests create their own output directories, so an existing `data/runs` tree is unnecessary. The first clean-copy run exposed that missing-directory assumption; its failed log remains preserved. Original evidence remains protected. Stale experiment gates, one unused internal type and an outdated validator-version diagnostic were removed. No prompt, model or dependency was changed; engine execution semantics remain unchanged.

Audit reports and final clean-copy verification are recorded under `data/runs/cleanup-audit-2026-11-05/`. These engineering checks do not establish a new discovery-accuracy score. The accepted best-effort contract, semantic counterexamples and deferred capabilities remain unchanged. No Nisc workspace move, edit, link or publication is part of this cleanup.

## Review corrections — 5 November 2026

The whole-library review identified two concrete defects. Final output mapping now honors `maxSteps`, `outputAttempts` and `maxMs` from its merged settings, capped by phase and remaining allowances in JSON. Tighter values no longer disappear; larger values cannot extend the attempt. Other jobs retain their existing settings calculations. Public-profile tests cover tighter/equal/looser/omitted limits, invalid values, remaining allowance and mechanical repair without a reset.

The isolated package verifier now allows TypeScript's optional platform compiler dependency while disabling automatic peer installation. Its existing core model/codec absence checks and three consumer phases remain enforced. No runtime dependency was added. Current verification is recorded under `data/runs/review-corrections-2026-11-05/`. These are engineering corrections, with no prompt/model changes or new paid tests; semantic review and future-reuse limitations remain unchanged.

## Output-mapping default — 5 November 2026

The best-effort decision is to use 120b/low for final output mapping. The JSON profile now declares `outputSettings:{reasoningEffort:"low"}`; JSON merges that override only when calling `build-output`. Task/source/schema/reference/review settings and every budget remain unchanged. The override is optional for supplied profiles, which inherit their existing base settings when it is absent. The engine, published Prism agent and model adapter are unchanged. This is a configuration adoption, not a discovery-accuracy or completeness claim. Typecheck, build, all 56 offline modules, 33 benchmark checks and the HTTP-only live PDF regression pass. Focused checks cover default isolation, explicit host overrides, legacy profiles and mechanical repair. Adoption evidence is under `data/runs/output-mapping-low-default-2026-11-05/`; no new paid calls were made.

The six normal-pipeline saved-source comparisons used real review with the existing one-correction limit. Low retained all requested original data, with two additional contacts on the timetable case; high returned exact original data but its footer-label filter failed one unseen change. Low output-mapping time totaled 7.448 seconds versus high's 32.256, while full discovery totaled 79.701 versus 103.268 seconds. All six reviewers accepted their initial working results, so semantic correction was not exercised; the low timetable verdict was a false acceptance. Evidence remains under `data/runs/discovery-repair-comparison-2026-11-05/`. Those research results remain frozen and are not rewritten by this configuration change. No new paid experiment accompanies adoption. Remaining relevance-review and reuse limits remain open.

## Dependency update and focused recovery verification — 5 November 2026

All direct dependencies were checked against npm and updated to their current releases. Signal is now 0.1.6; Cortex 0.1.4, Prism 0.3.1 and Strata 0.1.7 were already current. Signal 0.1.5 adds documented model defaults for unset options; Haptic's explicit settings remain unchanged. Signal 0.1.6 repairs an unclosed outer JSON object before accepting an internal fragment. All three exact saved Anima mapping replies now recover and execute to 19 source-matching class records. The exact saved Cortex conversation succeeds with one replayed response rather than exhausting three. All 23 valid saved Guardian/Anima responses retain identical output values. These are offline recovery checks, not fresh discovery results.

The broader dependency update includes the HTML selector/parser packages, OpenAI SDK, Zod and compiler/tooling. The only source adjustment supplies explicit node types and the existing `isTag` function to the updated selector adapter. Discovery JSON, prompts, settings and engine source are unchanged. Typecheck, build, the complete offline suite, 33 benchmark checks and the live HTTP-only PDF regression pass. Evidence is under `data/runs/dependency-update-2026-11-05/` and `data/runs/signal-recovery-check-2026-11-05/`.

One fresh unchanged Anima discovery publishes a working artifact: all 19 current classes and all six class-associated notes match independently parsed live captures, but two footer contact records are also returned. This is **useful partial**, not complete; the model review incorrectly accepts it as complete. The raw runner's unbound-role grade remains unscorable; a separate evaluator-only schema-role binding and exact per-class checks establish this classification without changing the artifact or model inputs. Discovery used eight provider requests, 113,430 input / 18,511 output tokens and 47.905 seconds, with no rate-limit waits. Independent live AI-free execution took 371.115 ms plus 194.819 ms preparation. Every fresh response was valid JSON, so the missing-brace fix was exercised by the saved-response checks, not this live run. No manual corrections or saved-page substitutions occurred. Original failed runs remain failed. Fresh evidence is in `data/runs/production-baseline-2026-11-05/live/animafabrik-timetable-2/`; this focused run does not update the broader qualification score.

## Closing qualification — 4 November 2026

The subsequent [record-association experiment](../measurements/record-associations-2026-11-04.md) tested two generic JSON prompt additions and reverted both after the source-only repeat failed to retain the initial improvement. Production configuration is restored exactly. One generated timetable artifact remains a useful specific result: `data/runs/record-associations-2026-11-04/cases/timetable/artifact.json` returned19/19 class records and all6 correctly attached notes in a fresh live AI-free execution (371.384ms, plus184.818ms preparation). It still omits a newly introduced Sunday group because its mapping freezes six observed weekdays. The later source-only artifact includes footer contacts and loses notes; it is not an upgrade. Five focused saved-source discoveries used38 requests,750,509 input/97,223 output tokens and281.860s summed discovery time. No generic accuracy improvement or new grade is claimed.

Subsequent [provider recovery](../measurements/provider-recovery-2026-11-04.md) adds JSON-configured bounded reactive SDK retries and structured provider-blocked outcomes. Pending requests retain their captured page/history; working artifacts survive blocked review or correction. Caller/global cancellation remains terminal. Strict typing, 56 offline modules, 33 benchmark checks and the required HTTP-only PDF regression pass. The independent targeted review cleared these ownership and cancellation paths.

One fresh original Spiegel discovery now publishes a working artifact: ten distinct source-supported article links/headlines, five descriptions, 11 provider transmissions, 450,773 / 24,196 reported tokens, 85.401 seconds discovery and 215.170 ms independent AI-free execution. It encountered no live429 or waits, so live quota recovery itself remains unexercised by this run. Four omitted descriptions exist in other cards for the same URLs on the page; one null description is absent from matching teasers. The reviewer accepted the result, but independent assessment is useful partial. This is a separate focused run, not an update to the frozen batch or historical grades.

The frozen [qualification report](../measurements/nisc-qualification-2026-11-04.md) records that broader batch's changes, actual results and version boundaries. XML source authors now write XPath only; the actual published Prism agent owns every mapping. The assembled pair must pass its joint trial. Reviewer inspections retain fitting full prepared HTML with scoped facts within existing limits. Integrity/resource controls terminate at their owner. Trial feedback now preserves available safe operation/path strings. No engine, model setting, dependency, database or controller changed.

The frozen original seventeen requests twice returned **24 complete, four useful partial, two unusable and four unresolved** results, compared with the earlier 25/1/2/6. More useful answers, fewer complete answers: broad accuracy improvement is not established. The four additional live requests returned the correct Steam price (19.99 EUR), partial Guardian and timetable data, and no Spiegel artifact after ordinary HTTP429 retries exhausted. All 33 published artifacts independently executed without AI. The frozen batch used 301 requests, 3,412,602 reported input / 734,493 output tokens and 19 minutes 16 seconds with two workers; nine HTTP429 requests have unavailable usage. Complete results were independently audited for field roles and cardinality rather than trusting a model verdict or unlabeled value bags.

A later diagnostic-only correction was separately tested on the same original XML → article → PDF request. It returned a working artifact and the correct 2,215,244-byte PDF; independent live execution took 107.04 ms, and changed/added/empty/namespace-prefix controls passed without AI. Discovery used 15 requests, 99,833 / 28,166 tokens and 78.05 seconds. Its automatic schema description incorrectly describes base64 data; actual data contains the PDF URL and downloaded bytes are separate. The final negative review follows that mistaken description. Working publication correctly preserves the artifact, resource and advisory verdict. This focused result does not replace the earlier failed XML test or update the frozen broad score.

Final reviews retain the original scopes: code quality overall **7.5**, Nisc integration **8.5**, whole architecture **7.5**. Prism/Strata and Cortex/Signal integration are each 9 in the Nisc review; discovery simplicity is 8. Broad unattended readiness remains 4.5. The requested overall nine is not achieved. Remaining concrete problems are semantic omissions/wrong identities and unsupported completeness claims, the inability to extract static comment data with the current element grammar, and source/traversal repair complexity. There is no manual artifact-approval requirement.

Closing checks pass strict TypeScript, 55 offline modules, 31 benchmark tests, 40 packaged documents/67 links, isolated package consumption with four AI-free artifact executions, and the live HTTP-only PDF regression. Package identity remains private `eden-next@0.0.0`; nothing was moved or published.

The earlier engineering and semantic sections below are dated history, not alternate current scores.

## Engineering consolidation — 4 November 2026

The whole-library review found a sound execution core but excessive discovery state, repeated calculations, weak phase contracts and inconsistent integration. The ownership corrections are implemented and independently reviewed against the frozen prior source and existing recorded controls:

- Model invocation options have one construction point across discovery and search. Unknown provider usage remains unknown.
- One optional host mechanical registry serves acquisition, preparation and trials consistently. Host-owned resources remain host-owned.
- Public discovery output has a strict, compact contract; private captures/transcripts are excluded. Working partial artifacts and advisory review remain visible.
- Raw captures have one acquisition owner, prepared documents one owner, and stage views use URL/hash identities. Source ownership and redirect evidence are checked explicitly.
- Fixed phases have cohesive JSON documents. Model settings, budgets and error calculations have shared definitions. The engine grammar and model prompts/settings are unchanged.
- Named phase contracts validate consumed and produced values. Open outer state transport is intentional; phase-owned values are closed. There is no new controller, database, planner or DSL.

The same-standard reassessment gives **7.5/10 for code quality, 8/10 for Nisc integration and 7.5/10 for whole architecture**, compared with the original 6.5/7/6.5. The earlier 8.8/8.5/8.8 comparison used narrower engineering categories and is withdrawn as a before/after comparison. Original records remain preserved. Using the original categories, discovery JSON/simplicity is now 7.5, discovery architecture 8 and discovery TypeScript 8 and broad unattended readiness remains 4.5. The cleanup fixed real ownership and integration defects; it did not establish a whole-library grade near 9 or improved semantic reliability. See the complete unchanged-category tables in the [review correction](../measurements/discovery-standards-2026-11-04.md#review-correction-same-original-standards).

The actual public projection on the same saved ten-row result falls from **12.6 MB to 73.6 KB**, preserving the artifact, schema, trial and verdict. Stronger contracts increase discovery setup: approximately **0.38 to 0.93 seconds median** in three recorded samples, and the composed discovery document grows from **413 KB to 804 KB**. This prepares the reusable discovery builder, not a finished artifact. The unchanged engine executes 1,000 simple sequential operations in **0.995 ms median** without HTTP or models.

Closing verification after the [local-dataflow refactor](../measurements/discovery-local-dataflow-2026-11-04.md): strict typecheck, all **52 offline test modules** and **15 benchmark-support tests pass**. The live HTTP-only PDF regression passes. Exact frozen/current checks cover 451 helper cases and 8 controlled complete pipeline cases, including model requests and public results. These prove preservation, not model accuracy. Current evidence is under `data/runs/local-discovery-dataflow-2026-11-04/`; earlier consolidation evidence remains dated history. Final packed consumption replays two saved artifacts in four executions with model imports forbidden and checks optional peer/declaration boundaries. No paid model tests were run.

Task/schema/output jobs now receive strict local inputs and return owned values; accounting/history no longer forward whole state. The root invokes review directly and retains orchestration/repair. Source/traversal still has broader coupling. Original-scope overall grades remain **7.5/8/7.5**. This is progress toward simpler internals, not achievement of the target nine or a new reliability result.

## Historical semantic evidence — 3 November 2026

The original seventeen tasks ran twice on 3 November: **25 complete answers, one useful partial, two unusable results and six attempts without an artifact**. All twenty-eight returned artifacts executed independently without AI. Both SQLite download outputs were manually downgraded after the automated selector check accepted placeholder URLs.

The later saved-artifact/fresh-discovery comparison returned all nineteen timetable class records, but omitted notes for four classes, including a cancellation and a substitute teacher. Fresh Guardian returned ten supported headline/link pairs and nine descriptions. Fresh Spiegel initially failed at provider parsing.

Following the provider recovery correction, one fresh Spiegel run returned five proper headline/link pairs, descriptions used as headlines and blank rows. Its reviewer falsely accepted it. The older unchanged artifact returned eight proper pairs and three descriptions on the exact same capture. Recovery is independently proved with the exact recorded provider error; that live run did not exercise it.

Recorded evidence:

- `docs/measurements/full-seventeen-source-boundaries-2026-11-03.md`
- `docs/measurements/replay-then-discovery-three-2026-11-03.md`
- `docs/measurements/provider-output-recovery-2026-11-03.md`
- `data/runs/whole-library-review-2026-11-03/report.json`

Schema validation, a working artifact and review acceptance establish different facts. None certifies semantic completeness or future website-layout reuse. Preserve useful partial results and report concrete failures; never silently rewrite those outcomes into passes.

## Remaining scope limits

Browser interactions, authenticated-session integration, alternate-endpoint discovery, plain-text discovery, downloaded-content extraction and automatic maintenance are deferred capabilities. The optional image-choice hook is discovery-only; no browser or image codec loads by default.

Reference traversal currently requires one format per frontier. Mixed formats, terminal JSON/XML data leaves within reference traversal, XML `xml:base` and recursive HTML child records remain unsupported. Missing learned stages require discovery rather than execution AI.

XML reference rules now use separate owners: the source author writes XPath, and the published Prism agent writes the mapping from actual selected values. JSON still trials the pair before committing it and retains upstream correction on failure. There is no composite source-author Prism exception. Current qualification evidence is recorded separately from the dated semantic results above.

At that pre-transfer checkpoint Haptic remained private under the temporary `eden-next` identity. The subsequent authorized transfer is recorded in [Nisc integration](nisc-integration.md); publication remains separate. See [handoff](nisc-handoff.md).
