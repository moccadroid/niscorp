# Fresh Vienna query and ownership audit — 30 October 2026

Input: **`ai meetups in Vienna`**. One fresh end-to-end Haptic search, no supplied source URLs, saved-page substitutions, saved model answers or manual artifact corrections. Native engine unchanged. Source, executed build, runner, recovery/codec, pacing/support inputs and lockfile were frozen and verified unchanged during the run.

Evidence: `data/runs/search-connected-2026-10-30T11-12-26-782Z`.
Console: `data/runs/search-vienna-scope-2026-10-30.txt`.
The assistant's separate assessment of unchanged output is `owner-assessment.json`; that is not an installed runtime filter.

## Actual query outcome

DuckDuckGo returned ten search results with HTTP 200. Jev evaluated all ten in one shared-context request. JSON ranking/threshold/cap selected five destinations. No CAPTCHA recovery, alternative query, downloaded resources, caller output schema or onward page traversal was used. Each successful artifact retrieved its found listing page only; its declared following allowance remained available but unused.

| Selected source | Actual outcome | Raw returned records |
|---|---|---:|
| Meetup Vienna AI | Reviewed artifact, four online events; two upcoming and two past | 4 |
| AIEventlist English | Reviewed artifact, three past Vienna meetup listings | 3 |
| AllEvents AI category | Reviewed artifact, ten broad events; contains unsupported/non-meetup results | 10 |
| AI Tinkerers Vienna | HTTP 403; no artifact | 0 |
| AIEventlist German | Reviewed artifact, translations of the same three past meetup listings | 3 |
| **Total** | **Four artifacts, 20 raw records** | **20** |

There are three obvious translation duplicates, giving seventeen apparent event identities after assistant display grouping. Haptic itself does not perform that grouping or remove the bad rows. Its raw records remain unchanged in `outcome.json` and four separate fresh replay files.

Relevant listings include:

- AI Summit (Virtual) — Run AI and Data Pipelines: 4 November 2026, Online; Meetup event 317176243.
- Google AI Deep Dive Ep 5 — Discriminative models: 11 November 2026, Online; Meetup event 317104140.
- AI Deep Dive with Google Ep 4 — Agents Security: 14 October 2026, Online; Meetup event 316892292.
- Google Agents in Production for Enterprises Ep 4: 12 October 2026, Online; Meetup event 316864324.
- Agentic AI: Wenn KI nicht nur antwortet, sondern handelt: 14 October 2026, Vienna / AI:AT AI Factory Austria.
- Agentic AI in der Praxis — Meetup Wien: 12 October 2026, Vienna / ÖBB Open Innovation Factory.
- AI Tinkerers Vienna — Builder Meetup: 1 October 2026, Vienna.

AllEvents also supplies **Embedded Austria No. 7: Embedded AI**, 12 November at SBA Research, as a promising local community-event lead. Its returned listing does not establish the event format, and its extracted date omits a year. Other returned AllEvents records include Moving Forward Conference, Legal Tech Konferenz, Language Intelligence, Retail Tech Day, a training workshop, a green-science conference, Die Chancen der KI, The Jury Experience – Die Killer-KI, and Get Well Soon • Wien • Arena. These cannot all be presented as AI meetups. The last two in particular supply no convincing evidence for the requested meetup format in the returned listing.

The AllEvents reviewer wrongly accepted the broad selection. Its reasoning says the records satisfy “AI meetups (including meetups among the events).” This is the same category-broadening failure class seen earlier: the page category and some qualifying records were treated as sufficient for all selected records. The JSON still instructs relevance for every returned record; this run does not prove that instruction reliable.

**Assessment: useful partial leads, contaminated raw answer.** HTTP 403 on one destination is an acceptable source failure; the unrelated/broader records are a query-result precision failure. Four accepted artifacts out of five attempted sources is a mechanical/qualification count, not an accuracy score. The result does not establish a clean current in-person Vienna meetup calendar or exhaustive coverage. Individual event-detail links were extracted, not all separately opened.

## Requests, usage and time

| Model role | Requests | Reported input tokens | Reported output tokens |
|---|---:|---:|---:|
| Jev search-result relevance | 1 | 1,694 | 164 |
| 120b task declarations | 5 | 2,774 | 3,783 |
| 120b rule authoring and mechanical repairs | 7 | 331,348 | 20,005 |
| 120b independent verdict reviews | 4 | 188,034 | 7,106 |
| **Total** | **17** | **523,850** | **31,058** |

All seventeen requests reported usage; all model HTTP responses were 200. Zero quota errors; no unavailable token values replaced by zero. Groq total: sixteen requests, 522156 input / 30894 output. Requested Jev model `jev-latest`, provider reported `jev-1.14.0`. Groq model `openai/gpt-oss-120b`, high reasoning, temperature 1, top-p 1, `emit`.

Discovery took **365.237 seconds**; the whole run including fresh replays took **366.107 seconds**. Configured quota pacing consumed **261.756 seconds**; summed provider/network time **93.574 seconds**. Twenty-two recorded HTTP GET operations plus capture writes consumed **6.183 seconds**. Approximately **4.594 seconds** remain for other local work and evidence handling. These are sequential-run measurements, not a pure engine dispatch benchmark.

All four returned artifacts completed a separate fresh HTTP replay, **749.757 ms combined**, zero model calls. Successful execution does not remove the AllEvents semantic error.

## Exact ownership and flow

1. **Host composition:** TypeScript wires the published operations, credentials, optional recovery adapter and recording. It prepares the static search JSON artifact. Strata checks document grammar stamps without a database; Prism compiles JSON expressions. No source or business choice is made by the host.
2. **Request/profile merge:** search JSON merges the unchanged instruction with defaults and caller overrides. Default cap: five destination attempts; relevance minimum two; threshold 0.5; one possible query rewrite. Per destination, search defaults allow following depth 1, while discovery supplies maxPages 4. The instruction cannot expand these allowances.
3. **Search HTTP acquisition:** search JSON supplies DuckDuckGo's endpoint/query parameter to native `url.build`, then existing JSON fetch/redirect helpers call native HTTP. First results page only. Native code implements URL, transport, byte/timeout and decoding mechanics; profile/flow JSON owns endpoint, selectors, acceptance and bounds.
4. **Search extraction/admission:** native HTML selection executes the provider's configured CSS/fields. JSON resolves supported wrappers, distinguishes results/recognized empty/recovery-required responses and rejects unknown layouts. On this run: ten results, no recovery. Optional image-choice recovery has its own JSON sequence; host code owns image conversion, Jev transport and form POST. It is not in extraction artifacts.
5. **Source relevance:** JSON invokes Jev with the unchanged instruction/query and mechanically extracted titles/descriptions/URLs. Native code only translates that into the provider protocol. Jev decides plausibility per result in one shared context.
6. **Selection:** Prism expressions in search JSON apply threshold, exact normalized URL deduplication, probability ordering and the five-attempt cap. Language variants remain distinct URLs. Because enough plausible sources exist, JSON does not request a rewrite. Rewriting uses 120b only under the configured JSON branch/budget.
7. **Per-source task declaration:** JSON invokes 120b with the instruction and starting URL to freeze navigation/resource intent. All five declared no required navigation and no resource action. Permission to follow remains an independent ceiling.
8. **Source acquisition/format:** JSON executes HTTP acquisition, admission and profile-declared format selection. AI Tinkerers stops at HTTP 403. The other four supply HTML. A found page is depth 0; DuckDuckGo consumes none of its following depth or per-destination page allowance.
9. **HTML preparation:** the existing JSON step invokes native inspection/preparation. It uses extraction's parser, clears configured payloads, serializes the private DOM and checks faithful round-trip plus bounds. Original captures remain intact. Models see HTML, not a JSON DOM or base64 source body. Search-result rows and later selected records are JSON because those have already crossed the extraction boundary.
10. **Authoring:** 120b sees the unchanged instruction, frozen action, permissions, prepared HTML and schema. It returns preconditions/CSS/optional dynamic fields/result references. It does not author the whole 100 KB helper bundle or call another agent. Rules are generated JSON data.
11. **Mechanical validation and recovery:** native code computes matches, field counts, scope and overlaps, enforcing artifact/profile bounds and grammar/permission constraints. Shared action admission evaluates JSON predicates through Prism. Failures go to Cortex output recovery; JSON settings bound attempts/time. Meetup used three author attempts; the German listing used two; other successful sources used one. No special website repair code was added.
12. **Binding and stage trial:** discovery JSON inserts the accepted rule into shared mechanical helper flows, creating an ordinary artifact. Native preparation admits its grammar. A stage trial runs real HTTP/extraction with mechanical operations and no models. It returns selected records/navigation candidates.
13. **Verdict:** JSON invokes a fresh 120b reviewer with instruction, current stage, same prepared HTML, rule and actual trial output. Output is only accepted/reason, not selectors. All four verdicts accepted; AllEvents was a semantic false acceptance. Existing JSON allows one author replacement after rejection; no rejected review triggered that branch in this run.
14. **Traversal/publication:** JSON manages breadth-first traversal, aliases and remaining page/resource allowances, binds learned stages and runs the finished artifact's combined trial before publication. This run's four learned rules chose no onward links; only found pages were visited. Optional caller-schema shaping would add an existing Prism-authoring/trial path; no schema was supplied here.
15. **Redundant immediate execution:** search JSON currently executes the finished artifact again even though discovery has already returned its completed final trial. This is unnecessary production discovery work, described below.
16. **Return and independent verification:** search returns attempts, selected sources, source outcomes, artifacts and native execution data. Failures stay visible. The test driver separately executes each returned artifact once with fresh HTTP and model calls blocked. Those artifacts contain only mechanical operations and learned policy/rules; future execution reads current page values. No answer-writing or cross-source record deduplication agent is installed.

The API's `insufficient:false` refers to enough plausible selected sources, not adequate or correct extracted answers. The query-rewrite decision occurs before destination extraction; it does not automatically assess or repair the combined answer. The assistant's result judgment above is separate from that API flag.

## Concrete complexity/ownership findings

1. **Duplicate production execution:** `discovery.json:534` already executes and returns the finished trial; `search.json:1226` repeats it. For these four single-page results that means four redundant GETs and repeated artifact preparation/extraction. The repeated GET/capture portions totalled **639.694 ms** on this connection. A source was fetched five times overall: initial acquisition, stage trial, final publication trial, redundant search execution, deliberate separate test replay. The last replay is evidence overhead; the fourth fetch is unnecessary library behavior. Consuming the completed discovery trial would remove the duplication without a cache or new engine.
2. **Duplicate parsing in preparation:** `html-context.ts:118` builds an indexed parsed tree only for resource validation; line 120 parses the original again for clearing. Line 160 reparses serialized output for the independently demonstrated round-trip problem. The integrity check is justified; the first two original parses should share the reader's work. This affects discovery, not finished execution.
3. **Declarative wiring is too large to call elegant:** discovery JSON is 5778 lines / 202822 bytes, mechanical JSON 3847 lines / 111598 bytes, search JSON 1298 lines / 34811 bytes. Returned single-page artifacts are 102194–108156 pretty-printed bytes and embed thirteen shared helper flows, including resource handling unused here. Self-contained helpers serve portability and avoid a mandatory catalogue, but nested binding expressions and repeated publication predicates impose real cognitive/maintenance cost. This is not equivalent to those bytes entering model prompts. No replacement grammar or catalogue was introduced in this slice.
4. **Policy prose still has two homes:** remaining model-facing descriptions in `html-author.ts:55` and `task-declaration.ts:13–16` include authoring/navigation advice that overlaps JSON prompts. The changed verdict/field-bound descriptions now defer policy to JSON and state mechanics, but this residual duplication can still drift. It is policy in native strings, not a native site-specific planner.
5. **Recovery host remains a portability limitation:** the optional module has injected codec/vision/form contracts, but this particular live driver calls `pwsh.exe` and a codec script under `benchmarks/captcha-evaluation`. It works on this host and was not used in this run; it is not a portable packaged codec solution or a mandatory core dependency.

Four independent checkpoint roles inspected grammar, Nisc alignment, execution/correctness and quality. No engine changes, database/journal, native search planner or website-specific decision branches were found in the audited path. The findings above remain explicit; reviewers did not authorize hidden refactors or waive the AllEvents quality failure.

## Changes and checks

The small generic JSON clarifications distinguish permission from obligation and useful lists from exhaustive crawling, restrict extra mandatory metadata and require observed parsed attribute names. Native schema descriptions were aligned without grammar/runtime changes. The host runner now instruments existing mechanical trials and fresh replays, freezes executed build/driver inputs and makes HTTP capture failures terminal. Its hashes/snapshots are test evidence, not a persistence requirement in the library.

`pnpm typecheck`, complete offline `pnpm check` and driver syntax checks pass. The unchanged HTTP-only PDF regression passed at `data/runs/live-pdf-2026-10-30T11-22-32-508Z`, returning 116547 bytes with the existing SHA-256. No additional paid batch or testcase-specific fix was performed after inspecting the query output.
