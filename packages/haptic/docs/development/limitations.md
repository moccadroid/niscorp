# Haptic: current limitations

See [current status](current-status.md) for the current engineering and semantic evidence. This document describes accepted scope boundaries and observed failures for the best-effort first release. They are not a backlog requiring perfect extraction, another paid experiment or a higher review grade. The earlier universal-controller experiment failed adoption and remains retired. Historical measurements remain dated. Offline checks do not establish a new live accuracy score.

## Qualification boundary — 4 November 2026

The [current qualification](../measurements/nisc-qualification-2026-11-04.md) distinguishes working execution, correct requested data and correct schema/reviewer meaning. All mappings now use the published Prism agent; the previous composite XML authoring exception is removed. Current XML download execution passes its focused live and changed-source checks, but automatic schema descriptions can still misdescribe URL data as file content and mislead review. The broad frozen batch does not establish improved completeness.

SQLite illustrates a separate reader capability: original/prepared HTML and model context contain a documented CSV comment with the real archive URL, while visible anchors target a placeholder HTML page. The current element-text source grammar cannot extract that comment. HTTP access works; browser/JavaScript necessity is not established. No website-specific decoder was added.

## Discovery and correctness

- Model task declaration, rule authoring, repair, ordering and query rewriting can misunderstand, decline or fail. Attempts are bounded by JSON policy; discovery can complete with no artifact.
- `completed` describes execution of the discovery workflow. It does not mean a usable artifact exists. Public `ready` means a mechanically verified artifact is available, not that its review is positive or that meaning, coverage or future reuse is guaranteed.
- HTML review can reject useful candidates or accept incorrect ones. Separate calls to the same model can repeat the same mistake. All formats use the same captured final-data reviewer; its model judgment remains fallible. Bounded fixed-pipeline repair can repeat correct work and consume the remaining allowance. A negative or unavailable verdict no longer suppresses a mechanically working artifact. Callers receive the verdict and decide whether to use it.
- Schemas, field bounds and declared preconditions detect only what they express. They cannot detect every wrong price, missed record, frozen version or changed meaning. Empty output can be valid; it is not proof that information is absent.
- Discovery stage trials and Prism sample shaping use discovery-owned responses; HTML final-data review receives the projected result and prepared views of those same captures. The final complete artifact trial fetches again: fresh values and downloaded resources are mechanically tested, not independently semantically reviewed. Resource bytes/metadata remain outside the declared data schema and final-data verdict.
- Default HTML preparation removes script/style payloads, including embedded JSON scripts, and clears configured attributes/inert contents. Original responses remain available to mechanical extraction. Information present only in cleared payloads is absent from the model view; automatic embedded-script JSON extraction is not supplied. The preparation step can be replaced/bypassed through its existing JSON policy, which does not execute JavaScript.
- Prepared HTML must fit byte, tree and round-trip limits. Byte allowances are not tokenizer/context-window guarantees. Whole admitted frontiers are offered together; there is no automatic batching, sampling or layout routing. Diagnostic outlines are bounded and can omit useful evidence.
- Final HTML review combines prepared evidence across learned frontiers within `maxInputBytes`. Several stages can fit individually while their combined review context fails that allowance. No partial evidence is silently substituted.
- Source content is untrusted model evidence. Preparation is not a browser sanitizer, and no general adversarial-content guarantee is established.
- Failure behavior is not one universal envelope: returned operation/check failures, thrown preparation/run errors, cancellation and completed discovery without an artifact require distinct handling. See [public API](public-api.md).

## Returned data and shaping

- Native HTML records contain selected element text, attributes and paths. Structured fields are **additive** during extraction: they do not remove container text. Automatic Prism shaping now separates final data from that native context; a learned mapping can still include unwanted content.
- Discovery always declares a result schema and applies Prism shaping. Caller schemas win unchanged; otherwise the separate ordinary-schema job proposes dynamic fields/types after source extraction. Its admitted schema stays fixed for subsequent mapping. The generated contract can misunderstand the request. HTML final-data review can catch a projection defect, but schema conformance and a positive verdict still do not prove correctness or completeness.
- Field names are dynamic. Record-scoped CSS reads return arrays of strings/null: `[]` means no matches, `[null]` a matched element without the requested attribute. Match bounds count elements, not non-null/nonempty/correct values. There is no implicit first-match selection, trimming, scalar conversion or record dropping.
- Recursive child-record grammars are unavailable. Prism cannot recover unextracted child structure or read the contents of downloaded files.
- Native HTML text preserves whitespace and excludes inert script/style/template/noscript content. It is parsed source text, not rendered/visual browser text. Selectors use the supported CSS engine, not arbitrary browser/jQuery selector extensions.
- JSON uses JavaScript number precision, not arbitrary precision. Non-JSON/non-finite values are unsupported. XML selection uses XPath 1.0 and namespace URI identity: prefix changes can work, while changed namespace URIs can silently produce valid empty selections.
- Caller schemas are object-form JSON Schema admitted by strict Ajv. No remote schema fetching. Unsupported reference positions and own `__proto__` entries in schema `properties`/`patternProperties` fail explicitly (literal const/enum data is not prohibited); HTML/XML field keys also exclude `__proto__`.
- Learned rules/mappings can freeze changing values, omit data or assign incorrect meaning. The saved 7-Zip version and Steam unrelated-offer cases remain counterexamples, not repaired universal guarantees.

## Acquisition and formats

- The supplied web transport is HTTP/HTTPS GET. No browser, JavaScript execution, rendered DOM, clicking, scrolling, form navigation or browser session is installed.
- There is no built-in login, cookie jar, consent or authenticated-session workflow. Raw GET supports explicit headers; authentication is not universally impossible. Discovery's request contract exposes no header/login/session fields. Host-supplied acquisition is a separate capability. Link following can cross origins; the supplied discovery profile has no domain/IP allowlist, so hosts own any network-access policy.
- Discovery selects a configured HTML/JSON/XML adapter from terminal Content-Type; exactly one must match. No content sniffing, arbitrary parser fallback, alternate-endpoint discovery or automatic API discovery.
- Plain-text discovery, HTML embedded inside JSON and downloaded PDF/document/image content extraction are unsupported by the supplied discovery workflow.
- Native content decoding supports identity, gzip/x-gzip, deflate and Brotli. Changing byte/count allowances does not add other codings such as zstd.
- HTML uses configured encoding sniffing/fallback and fatal decoding. Non-ASCII legacy-encoded URL queries are refused. JSON must be valid UTF-8 JSON. XML rejects malformed XML, DTDs and unsupported encodings including UTF-32; external entities are not fetched.
- HTTP, decoding, parsing and reader allowances can reject an otherwise accessible endpoint. These are configurable resource bounds, not proof that its information is absent.
- Refusals, challenge pages and unknown layouts can block acquisition. HTTP 403 alone does not establish that a browser is required. Google HTTP result acquisition remains unproven on the tested connection; that is not a universal impossibility claim.
- The operation registry is host-owned. The engine executes registered capabilities; it is not a browser or an isolation sandbox for arbitrary host code.

## Traversal and resources

- Traversal is breadth-first. Caller permission is an independent ceiling; instruction text cannot raise it. Direct discovery defaults link/resource permissions to false. Permission does not itself require following or downloading.
- One source format is supported per depth frontier. Mixed frontiers fail. One learned stage serves the admitted frontier; automatic heterogeneous-layout routing is unavailable.
- JSON/XML reference traversal can supply links/resources, but terminal JSON/XML data extraction inside that traversal is unsupported. Standalone JSON/XML extraction works separately. XML `xml:base` reference resolution is unsupported.
- Missing learned stages fail before acquiring the unlearned frontier. Another discovery/maintenance run is required; finished execution does not improvise.
- `maxPages` includes the starting target and is shared across branches/depths. Redirects have a separate allowance. Previously unknown aliases can consume target slots even when the final document is fetched once. `limited` signals bounded output, not completeness. Empty selections create no result page.
- Supported result processing fetches linked resources as bounded in-memory bytes/metadata. No downloaded-content extraction or streaming destination API. Failed resources fail through the ordinary flow; there is no configurable ignore-failures mode.
- No mandatory file writing, database, journal, cache service or durable resume. Callers own persistence, scheduling, notifications and external retry/maintenance policy.
- Cancellation is checked at boundaries. Synchronous XML/XPath or codec work cannot be interrupted inside a dependency call.
- Increasing depth/page/resource/model/reader/engine allowances does not add unsupported capabilities.

## Search and optional recovery

- Default search is one DuckDuckGo HTML results page per query. No pagination or Google/Bing fallback workflow.
- Defaults are five attempted destinations, a desired minimum of two qualified sources and one rewrite. These values are JSON policy and configurable, not engine constants.
- Ranking sees titles/descriptions/URLs, not destination HTML. It can omit useful candidates or select weak ones. ID membership/uniqueness/count checks ensure a valid shortlist, not good judgment. Omitted candidates are not appended as fallback.
- Each attempted destination consumes the shared follow allowance regardless of success. Page/resource allowances apply separately per selected destination. If the first shortlist consumes all slots, later failures leave no capacity for a rewritten query.
- The minimum-source count is mechanical sufficiency, not answer accuracy. It does not stop visiting the selected queue early.
- Search gives each destination its own default link level. Search/recovery hops do not consume destination depth. Exact normalized URLs are deduplicated; canonical/language/semantic deduplication is unavailable, so equivalent sources can consume separate slots and repeat records.
- Query rewriting is bounded and model-authored. Preserving instruction meaning is prompt policy, not a mechanically proven equivalence. Provider challenges/unknown layouts are failures, not empty searches; they do not trigger query rewriting. Recognized empty results do not prove global absence.
- Search returns per-source artifacts, results and failures, not a merged, curated or deduplicated final answer. Its `execution` reuses the completed final discovery trial; it is not another fresh replay.
- Search recovery is explicit, discovery-only and host-injected. It does not provide general destination-page challenge recovery. The optional image-choice adapter supports the observed form/image protocol, not arbitrary CAPTCHA types.
- Host owns image preparation, vision credentials/transport and form POST effects. The optional ImageScript entry handles configured single-frame PNG/JPEG tiles, not arbitrary formats/animations. Recovery continuation supports POST-to-GET redirects, not retaining POST through 307/308.
- Focused successful recovered searches do not establish broad search/CAPTCHA reliability.

## Reuse and current evidence

- Finished artifacts contain no model credentials/operations, semantic fallback or automatic repair/maintenance. URL-only reuse is not universal cross-site/layout compatibility.
- Same-source replay proves reproducibility on those captures. Changed/added-value demonstrations are scoped observations, not future correctness guarantees. Optional `asOf` is caller context, not a native clock, future-only rule or added locality restriction.
- In the historical three-case fixed-source full-discovery panel before automatic result contracts, city authoring matched “ai” inside “Lainzer”, failed repair and returned no artifact despite supported listings. SQLite returned exact heading/list fields alongside explicitly excluded body context. The Vienna-group online results were location-ambiguous under the unchanged request. Two available artifacts and two exact AI-free replays were not a correctness score.
- Online Vienna-group listings do not prove physical Vienna events; the unchanged query did not impose physical-only attendance. Ambiguous task/source evidence can remain ambiguous.
- Current-frontier authoring, mechanical retries and final review can still be expensive. Own-job JSON proposal/observation/review histories are retained; the retired controller conversation and repeated source bodies are not replayed. Model quotas/provider failures and unavailable usage remain operational limitations. There is no organisation-wide quota coordinator or automatic pacing service; hosts own cross-run quota/concurrency coordination. No latest universal accuracy, cost or latency guarantee is established.

The subsequent real-model result-contract batch returned only two correct usable artifacts in ten runs (both XML), with a wrong-empty JSON artifact and four correct SQLite/PostgreSQL candidates rejected. The contract-boundary refactor that followed has offline evidence only; it does not regrade that batch or establish improved paid-model accuracy.

## Runtime and release

- Haptic is integrated as private `@niscorp/haptic@0.1.0` in `packages/haptic`. Its first npm publication is a separate release action.
- Headless ESM Node library, declared Node `>=22.13.0`. No CommonJS or verified multi-runtime compatibility matrix. Handoff verification records its actual runtime.
- Prism, Strata and Zod are required peers. Cortex/Signal/OpenAI are optional discovery peers; alternate provider SDKs remain host responsibilities and are not all installed/tested here. ImageScript is an optional explicit entry/peer; normal execution/search does not load it.
- Hosts own credentials, close operation factories, handle failures/cancellation and choose concurrency. TypeScript consumers need the Node type environment; the isolated check uses installed `@types/node` and explicit `types:["node"]`. Package checks cover the tested locked dependency graph, not every newer transitive resolution. Package managers/lockfiles may retain optional peers; core verification explicitly excludes them and checks package-level absence. Package checks prove consumption/contracts, not live discovery accuracy.

See [handoff preparation](nisc-handoff.md), [current capabilities and dated evidence](remaining-work.md), [search](search.md), [reference traversal](reference-following.md) and [output shaping](output-shaping.md).
