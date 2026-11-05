# Source-grounded discovery: complete target design

Status: **implemented; adoption gate failed on 2026-11-01**. The user approved the design, implementation, reviews and tests. Two candidate cases returned no artifact; the fixed gate stopped further paid work. Ten candidate cases remain untested. This document preserves the original target and decision criteria, not a claim that the design succeeded. The post-experiment report is `docs/measurements/source-grounded-discovery-2026-11-01.md`.

## 1. Objective and non-negotiable boundary

An unchanged request and URL, with optional caller schema and explicit acquisition permissions, automatically produce either a useful reusable artifact or an honest unresolved result. There is no mandatory human approval step.

The finished path remains **JSON artifact → the existing prepared in-memory engine → current result data**. It has no models, model credentials, database, catalogue, persistence requirement, discovery conversation or runtime artifact repair. Source/format adapters, Prism expression grammar, static execution templates, Strata stamps and engine admission stay with their existing owners.

The change is the discovery algorithm: a bounded author observes what its proposed choices actually do before committing them. It does not change the engine into an agent. Logic and budgets remain JSON; native operations perform typed model calls, source inspection and mechanical execution.

Success means more correct usable artifacts across different tasks, fewer wrong publications and false rejections, and demonstrated execution against changed inputs. Valid schemas, successful same-source replay and code-review grades are supporting evidence, not the objective.

## 2. Evidence motivating the change

The latest complete panel is `data/runs/contract-e2e-models-2026-11-01T15-09-56-847Z`: ten runs over five tasks, eight artifacts, five strict passes, two useful incomplete Meetup outputs, one problematic SQLite output and two no-artifact runs. It is not a general 50% website-success estimate.

Meetup selection used a case-insensitive title substring `AI`, admitting Lainzer and excluding Pi Durable, whose organizer supplies the AI connection. A later proposal recovered all five supported records plus Lainzer, but its duplicate precondition was invalid. Repair reverted the selection while correcting that unrelated issue. Prism then removed Lainzer but could not recover the already-excluded record.

SQLite final feedback about release pages restarted chronology authoring. Automatic schema, extraction and review also reinforced the same flattened-entry interpretation. The newer schema-only interface admits documents more reliably but still proposes unproven output representations.

Two benchmark qualifications must precede another comparison. `expectedVisited` is numeric in Meetup/SQLite criteria, but the evaluator compared it directly with an array. Fixing that comparison alone changes no pass in the recorded panel. The frozen SQLite whole-list text also contains hashes nested inside malformed parsed lists; DOM-text equality does not independently settle semantic footer exclusion. Preserve all old scores/evidence. Do not silently convert these observations into new historical grades.

## 3. What changes, and what does not

| Responsibility                                                  | Target owner                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Public request, caller schema and permission ceiling            | Existing public boundary and JSON admission                                                      |
| HTTP, aliases, visited state, breadth-first frontier, resources | Existing mechanical JSON helpers and native transport                                            |
| Source decoding, parser alignment and HTML preparation          | Existing readers and preparation policy                                                          |
| Model choices and conversation transitions                      | One JSON authoring workflow                                                                      |
| Typed action/candidate shapes and Cortex recovery               | Owning Zod contracts and unchanged Cortex                                                        |
| Source units, qualification and result meaning                  | One logical author with original request and accumulated observations                            |
| Candidate binding, mechanical trials and publication            | Existing JSON mechanisms, composed by the authoring workflow                                     |
| Final semantic guard                                            | Existing final-data reviewer, explicitly fallible; separate navigation semantic reviewer removed |
| Finished execution                                              | Existing engine and mechanical registry                                                          |

“One author” means one retained task/candidate/observation context. It does not mean one enormous response, one process with hidden memory, or a model writing the whole workflow. Cortex calls remain stateless typed invocations; JSON carries the conversation and remaining allowance. No agent writes prompts for another agent.

No new intent language, expected-answer artifact, expected-element comparison, semantic truth oracle, generic agent framework, native planner, dynamic native-operation dispatcher or dependency-invalidation framework is introduced. No retired A/B/C implementation returns.

## 4. Public behavior

Keep the existing request:

```text
{url,instruction,asOf?,allowLinkFollowing?,linkDepth?,maxPages?,
 allowResourceFetching?,maxResources?,outputSchema?}
```

The instruction and optional time remain unchanged. Permissions default through the existing JSON profile, and neither model output nor prose can increase them. A supplied schema compiles before HTTP/model effects and remains immutable. The existing two-field task declaration remains separate and read-only during authoring; it does not create acquisition permission.

Keep the existing success/unresolved behavior: a published artifact and its complete trial, or null artifact with retained diagnostic observations. Do not invent a second approval requirement or redefine a failed task as success by silently publishing a broader extractor.

The completed discovery value has a small, stable diagnostic boundary. Preserve existing fields and add `reason` and `partialTrial` rather than forcing callers through private authoring state:

```text
status: reviewed | unresolved
artifact: current admitted artifact | null
outputSchema: effective ordinary schema | null when not yet available
trial: final complete fresh-trial outcome | null when none ran
reason: concrete unresolved reason or known scope note | null
partialTrial: {outputSchema, outcome} | null
```

`partialTrial` is the last completed captured whole-bundle trial and its matching schema, potentially a rejected earlier proposal. It is diagnostic data, not certified output or an executable artifact. A field-level preview is never placed there as though it were a complete result. Unresolved must have a concrete reason and null artifact. An invalid initial request or unexpected/cancelled run retains the existing engine error/promise contract; this is not a new universal error envelope. `reviewed` means the current observed candidate passed the guard and required trials, not proven completeness or future correctness.

Finished inputs remain `{url}`. Finished outputs remain `{data,visited,limited,redirects}`, with declared resource bytes/metadata outside data. `limited` continues to mean mechanical acquisition/resource limitation; it does not mean unknown semantic completeness.

Discovery may report a concrete known limitation in its existing diagnostic data. An unresolved attempt may retain useful partial trial data without publishing it as a completed request. Generic warnings on every result are not required.

## 5. Complete producer-to-consumer path

1. **Admit fixed inputs.** Resolve host profile, caller ceilings and caller schema. Declare the existing action contract. These facts cannot be edited by the author.
2. **Acquire and prepare.** Existing HTTP/format/BFS helpers own captures and source identities. HTML receives the current default preparation; JSON stays native values and XML stays original XML. Initial model evidence remains the full currently admitted source context within the existing input-byte limit. Do not add semantic prefiltering, automatic outlines, silent page samples or context summarization in this refactor. Oversized initial context fails explicitly, as it does now.
3. **Construct source stages with observations.** The author can request bounded inspections, propose a stage rule, see its actual selection/trial, and either revise a focused component or finish the current stored stage. A successful proposal is observed before stage commitment. The existing traversal then acquires the next admitted frontier.
4. **Resolve automatic output shape after grounding.** If no caller schema exists, invoke the existing ordinary-schema author after structural observations exist. Supply the unchanged request, available source/extraction capabilities and observations, clearly separated from the requested result. Do not infer the schema mechanically from example output or let an incomplete subset redefine correctness. Retain the compact derived schema-authoring guide.
5. **Construct qualification and shaping.** Author an ordinary Prism program against the actual native extraction and the effective result contract. The author sees its actual input and trial output, not merely a pass/fail count. This is the owner of task qualification; do not repeat an approximate topic test in multiple stages.
6. **Finish the current tested bundle.** A ready action contains no replacement program. JSON checks the stored current candidates, binds the existing templates and runs the captured complete trial needed for final acceptance.
7. **Apply the existing semantic guard.** A fresh verdict-only reviewer judges the unchanged request, caller/generated contract authority, actual final values, matching source evidence and real acquisition scope. It cannot replace rules or waive permissions. A rejection returns to the same author context under the remaining allowance and existing bounded repair policy, not to a fresh chronology/start-page author. Mechanical navigation facts plus the same author's observation replace the separate HTML navigation semantic reviewer; that old review path is removed, not silently retained outside the budget.
8. **Fresh mechanical trial and publication.** Positive review still requires the existing complete URL-artifact trial. Resource bytes/media checks remain mechanical. Publish only the current assembled artifact. Changed values in this fresh trial are mechanical evidence, not a new semantic certificate. Any failure or cancellation prevents publication.

Schema generation may be revisited when observations show an infeasible generated target, including a shaping failure before final review. This uses the same author budget and focused editing rules; it is not an extra repair cascade. A caller schema cannot be revisited. An inability to satisfy it is unresolved.

### Finite transition table

The workflow has fixed phases and a focus, not a general scheduler. `mode` is initial or repair. Every observation/action uses the same owned state and remaining allowance.

| Phase                        | Offered model response                                                 | Ready/progress guard                                                                                                                              | Next phase                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input/task                   | Existing two-field task candidate; Cortex recovery                     | Caller admission and task/permission checks                                                                                                       | Acquire initial source; invalid task may receive existing JSON admission feedback within shared allowance                                                                                              |
| Acquire                      | No model action                                                        | Existing acquisition and supported-format admission                                                                                               | Source stage, or explicit failure                                                                                                                                                                      |
| Source stage                 | Inspect / propose existing whole initial rule or focused part / finish | Propose always executes component checks and current source trial, then returns observation; it does not advance automatically                    | Stay until a subsequent finish, explicit focus inspection or unresolved                                                                                                                                |
| Source finish-ready          | Ready with no payload                                                  | Current source trial completed for all current frontier sources; required navigation/processing fields admitted; author received that observation | Initial mode: acquire next admitted BFS frontier, or contract/output when traversal is complete. Repair mode: resume missing descendants if navigation changed, otherwise current bundle prerequisites |
| Automatic contract           | Exact ordinary schema body, not an action wrapper                      | Existing schema compilation/admission; failure feedback consumes shared allowance                                                                 | Output phase on success; unresolved when response/shared budget is exhausted                                                                                                                           |
| Output authoring             | Inspect / propose existing Prism config / finish                       | Propose trials the whole captured extraction + Prism + effective schema, then returns actual input/output observation                             | Stay until a subsequent finish, explicit focus inspection or unresolved                                                                                                                                |
| Output finish-ready          | Ready with no payload                                                  | Current captured combined trial completed, required source stages/current schema valid, no untested replacement                                   | Final review eligibility                                                                                                                                                                               |
| Review                       | Existing verdict-only schema                                           | Positive valid verdict                                                                                                                            | Fresh complete URL trial                                                                                                                                                                               |
| Review rejection             | No automatic whole-tree rewrite                                        | First valid negative verdict, author/review allowances remain                                                                                     | Same author in repair mode, initially focused on output with all producing components/observations available                                                                                           |
| Review invalid/exhausted     | No author-supplied override                                            | No valid verdict or exhausted review allowance                                                                                                    | Unresolved                                                                                                                                                                                             |
| Fresh URL trial              | No model action                                                        | Complete mechanical success and no cancellation                                                                                                   | Publish current stored bundle                                                                                                                                                                          |
| Fresh URL trial failure      | No extra author/reviewer cycle                                         | Failed/rejected outcome or failed declared mechanical check                                                                                       | Terminal unresolved for this design; retain failed trial. `limited:true` alone is not a failure                                                                                                        |
| Any author finish-unresolved | Concrete reason, no replacement                                        | None                                                                                                                                              | Terminal unresolved with last captured bundle diagnostic if available                                                                                                                                  |

In source and output phases, component inspection may change focus to another already offered stage/part; JSON then offers that part's narrow proposal schema. Contract focus invokes the pure schema-body phase. Returning from a focused correction in repair mode resumes the current bundle prerequisites, not the original chronology. Navigation changes explicitly remove downstream learned stages before resuming BFS. Initial successful contract/output bodies do not cause a new budget allocation.

A source-ready action is not bundle-ready. A bundle-ready action is not publication authority. A ready action without the specified current trial markers is rejected as an author observation and consumes its turn; it cannot bypass checks.

## 6. Protected state and editable draft

All state is ordinary in-memory JSON owned before asynchronous effects. Do not expose or serialize the full state to the model.

```text
fixed
  original request/asOf; caller schema; ceilings; task; host settings
acquisition
  owned captures and canonical aliases; BFS frontier/depth; charged allowances
author
  validated action/observation transcript; remaining model allowance; focus
draft
  source-stage rules; schema and origin; Prism program
observations
  component trial facts; current captured bundle trial; review; fresh trial
```

Captures are addressed by existing identities plus simple run-local indices. No hash-derived permission IDs, receipts, registry or persistence is needed. Run-local inspection references never enter the published artifact. Original captures and failed proposals remain available through existing optional evidence recording.

Acquisition history and current-draft visitation are distinct data. `acquisition` owns immutable captures, canonical aliases and charged targets/resources for the whole discovery run. `draftTraversal` owns the source/stage frontier and processed-target set for the current proposed walk. A navigation edit recomputes the affected draft walk and re-evaluates rules on existing captures; “already acquired” never means “skip extraction under the revised rule.” New HTTP work consumes remaining acquisition allowance. Removed branches remain charged. Published execution and its fresh trial each use their own existing mechanical traversal state for the final current rules, under the same caller ceilings; they do not inherit discarded discovery branches as result URLs.

The model cannot supply `fixed` or `acquisition` replacements. An inspected source reference must resolve to an already owned capture. Inspection never accepts an arbitrary URL or calls transport.

There is one current draft. Every change clears current combined-trial/review/fresh-trial markers. Cheap component checks can be rerun. Do not build a general caching/dependency graph or reuse a verdict through fingerprint matching.

## 7. Model interface: small phases, not one giant grammar

Use phase-specific schemas. Do not combine HTML, XPath, ordinary-schema and full Prism grammars into one recursive response union.

| Phase                   | Model sees                                                                                                                           | Candidate grammar                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Source authoring        | Original task, caller schema if any, current owned frontier, prepared/original-format evidence, current rule and actual observations | Existing format-specific rule, wrapped by a small inspection/proposal/finish control contract       |
| Focused rule correction | Same task and evidence, the failing component, other components read-only, concrete trial error                                      | Only that component's existing schema                                                               |
| Automatic contract      | Same task, source/extraction observations, capabilities, prior generated contract if applicable                                      | Existing `ResultSchemaBodySchema` and compact guide                                                 |
| Qualification/shaping   | Same task, effective contract, complete actual native extraction, source relationships and trial observations                        | Existing Prism ConfigSchema/profile, with a small phase-specific inspection/proposal/finish wrapper |
| Final review            | Actual shaped values and matching source evidence with scope                                                                         | Existing `{accepted,reason}` only                                                                   |

The action wrapper is discovery control data, not a new executable query language. Its payloads are existing grammars. The native operation's Zod schema is authoritative. Model documentation derives from that schema and existing Prism/reader contracts; do not hand-maintain a second grammar. When documenting a wrapped Prism candidate, keep its profile in its own documented scope; do not inline a root-relative profile under a new property without preserving reference meaning.

Conceptual control forms:

```json
{
  "action": "inspect",
  "view": { "kind": "source", "source": 0, "query": { "selector": "main article" } },
  "window": { "offset": 0, "limit": 4 }
}
```

```json
{ "action": "propose", "candidate": { "selector": "main article", "fields": {} } }
```

```json
{ "action": "finish", "status": "ready" }
```

```json
{
  "action": "finish",
  "status": "unresolved",
  "reason": "Concrete unsupported or missing source evidence."
}
```

The proposal shape above illustrates an HTML selection-focused call; it is not the grammar for navigation, conditions, XPath, schemas or Prism. Current focus determines the exact offered candidate type. The model never names native operations, flow IDs, arbitrary JSON patch paths or engine steps. It does not author copied acquisition code.

Exact inspection variants are:

```text
source:    {action:inspect, view:{kind:source, source:<owned index>, query:<current format query>}, window?:{offset,limit}}
component: {action:inspect, view:{kind:component, target:{stage:<offered stage>,part:<offered part>}}}
value:     {action:inspect, view:{kind:value,target:trialInput|trialOutput,path:[string|integer,...]}, window?:{offset,limit}}
```

Source inspection is read-only and does not change edit focus. Component inspection returns that component, its producing observations and source manifest, and explicitly changes focus; it does not edit the draft. Generated schema and output are named global component targets rather than fake stage indices. Value inspection reads the latest captured combined input/output by existing value-path semantics, not an arbitrary expression. Missing paths return a typed observation, not an invented empty value. All references undergo JSON membership checks against offered owned sources/stages/parts before effects.

Component targets have exactly two shapes: `{stage:<index>,part:selection|navigation|conditions|processing|referenceExtraction|referenceProgram}` or `{part:schema|output}`. Only applicable parts appear in the offered set. `schema` is absent when caller-owned. The first complete source proposal is a separate initial focus, not permission to overwrite the whole rule during every correction.

Source queries use CSS/fields for HTML, the existing XPath/namespaces/fields contract for XML, and an existing native value path for JSON. They never contain a URL or operation name. Window offsets/limits count matched elements or array entries. Object/scalar values are returned whole at the requested path or rejected for observation size; no implicit property sampling. HTML markup views return complete selected serialized subtrees; an oversized subtree is omitted with its index/size and an explicit limit result, never chopped into misleading markup. Query refinement or a narrower value path is the continuation mechanism. Every response records total/returned/omitted ranges; extraction/trials remain complete.

The first source proposal may supply the existing complete stage rule to avoid separate model calls for trivial defaults. Mechanical admission records facts by existing component. Thereafter a mechanical component error narrows the next writable schema to that component: a conditions-only response cannot overwrite a selector. Components not yet fully admitted remain proposals, not semantic truth.

For semantic feedback, the author can inspect a named existing component to change focus. Targets are a finite offered set of stage/component references or generated contract/shaping, never an arbitrary object path. A focus change does not itself edit the draft. JSON offers the appropriate narrow schema on the next call. There is no native classifier parsing a review's free-text reason into repair actions.

Focused source/output calls retain the same inspect/propose/finish wrapper around their narrow candidate type. “Conditions only” restricts the proposal payload; it does not remove inspection or finish. JSON standalone data sources have no invented CSS/XPath extraction phase: native reading supplies the source value, inspection is available, and authoring proceeds to contract/output. JSON/XML reference traversal instead uses its existing reference extraction/program components.

Prism wrapper documentation is normative: the small outer action guide identifies `candidate` as `PRISM_CONFIG`; a separately titled, standalone profile is emitted using Prism's existing owner-derived profile document. Root-relative references in that profile retain their own document root. Do not embed it as a JSON Schema under `candidate`, generate a combined mega-schema, or rebase its references by hand. Runtime Zod still validates the wrapper and candidate against the existing ConfigSchema. Complete offline Cortex-wire checks must demonstrate valid wrapper examples, invalid action/candidate rejection and unchanged profile meaning.

In the automatic-contract phase, retain the existing exact schema-body output rather than wrapping every phase in the same action union. Failed syntax/shape responses remain Cortex's job; after a valid contract or exhausted response allowance, JSON resumes the surrounding author workflow.

## 8. Exact context ownership and conversation

Each request is assembled explicitly, not by stringifying state:

1. Stable author instructions from JSON.
2. Current phase's owner-derived output documentation.
3. Cortex's existing emit-envelope protocol.
4. Original instruction and optional time, unchanged and once per request.
5. Caller contract or the clearly labelled current generated proposal.
6. Current focus, complete admitted frontier manifest, permissions and remaining allowance.
7. Retained validated author actions and mechanical observations, with original-format source messages.
8. The current component and actual latest trial when needed.

Do not repeat the task per record/query or include grading labels. Prepared HTML and original XML remain text messages. Native JSON and values actually selected from XML/HTML may be JSON. Transport envelopes, base64 bodies, credentials and removed script/style/SVG payloads never enter model context.

The author transcript is data carried by the JSON workflow. A valid emitted action ends one Cortex invocation. JSON executes its statically declared helper and appends the observation before the next call. Cortex continues to own envelope/schema recovery; it does not own Haptic's phase transitions or publication. No `resumeRun`, native tool-execute policy bridge or agent-prompting-agent chain is needed.

Do not silently summarize or discard observations to fit context. The configured request-byte boundary is explicit; it is not a tokenizer guarantee. If the conversation cannot continue within it, return unresolved and retain the evidence. Context management beyond bounded views is not another project inside this refactor.

## 9. Inspection reality and the one new mechanical capability

Reuse current operations: HTML measurement and selection, JSON reading/Prism access, XML inspection/XPath, ordinary artifact preparation/trials. Successful inspections return actual values as well as existing errors/counts; success is not a relevance/completeness verdict.

One capability is missing publicly: a bounded **scoped prepared-HTML view**. `html.inspect` currently returns decoded whole HTML; `html.measure` supplies counts/outlines; `html.select` supplies native selected records. Existing `HtmlStructure` already has query/path/serialization mechanics. Expose scoped markup through those mechanics without changing the engine or extraction source.

Requirements for that operation:

- Same parser defaults and prepared/cleared representation as authoring today. No cleared payloads may leak through an alternate view.
- Source must already be owned. CSS, source index and explicit display window only; no HTTP, forms, JavaScript or browser.
- Typed output records source identity, query, total matches, displayed range, omission/byte-limit facts and prepared HTML strings.
- Display windows limit observations, not executed extraction. Every source-stage trial still covers its entire admitted frontier under actual reader limits.
- Truncation is explicit. A bounded preview never stands for complete coverage.

JSON inspection uses existing native value/path semantics. XML inspection retains original XML; XPath-selected values become JSON only after selection, as today. No universal converted-document representation or new selector language is introduced.

Prism observations expose actual input and output. Do not promise universal per-row kept/dropped lineage for arbitrary aggregations: that would require additional machinery. Where record counts/identities are already available they can be shown as facts; they are not an expected-answer oracle.

## 10. Structural selection and qualification

Structural source selection identifies the relevant collection and preserves the fields/context required to evaluate the task. It must not prematurely approximate a semantic concept with a title substring and then repeat that approximation in shaping.

Qualification belongs to the authored Prism program over source-supported facts. Direct source-native restrictions such as an explicit media/type attribute may remain in selection where justified; this is not a blanket ban on CSS predicates or XPath filtering. The required ownership rule is that semantic task filtering has one visible owner and enough source information to operate.

This statement concerns result-record qualification. HTML navigation retains its existing `links` CSS capability; this target does not invent an HTML navigation-Prism adapter. JSON/XML onward/resource qualification retains its existing reference Prism program. Those are distinct output roles, not duplicate filters on the same result set. Their authors must likewise observe the actual references and use source-supported criteria, or decline an unexpressible request.

This does not require a separate predicate DSL, universal flat-record envelope or mandatory filter stage. JSON documents can be scalars or structured trees; Prism retains its existing generality. Field names stay dynamic, and native HTML field arrays remain intermediate representation.

The author must distinguish a source-supported mechanical criterion from background semantic understanding that future records would require. Jev may assist an explicit discovery-only decision in a future profile, but classifying today's records is not a reusable rule for tomorrow. This target adds no mandatory Jev screening phase and changes neither search ordering nor CAPTCHA recovery.

If requested qualification cannot be expressed adequately with available evidence/capabilities, return unresolved rather than claim a broader extractor fulfils it. Useful bounded results can satisfy a non-exhaustive list request; known omissions contrary to explicit “all” or a caller contract cannot be silently relabelled complete. The system cannot universally prove unknown semantic completeness, and does not claim to.

## 11. Repair locality and invalidation table

| Edit                         | Writable data                     | Preserved data                                        | Invalidated observations/work                                             |
| ---------------------------- | --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Context preconditions        | That stage's preconditions only   | Selection, fields, navigation, other stages, captures | Current stage trial and all combined acceptance markers                   |
| Selection/fields             | That stage's selection component  | Other stages, navigation and captures                 | That stage extraction, shaping and combined acceptance                    |
| Navigation/reference program | That stage's navigation component | Earlier stages and already acquired captures          | Descendant learned stages and combined acceptance; recompute BFS frontier |
| Generated schema             | Generated schema only             | Caller request, source stages, captures               | Shaping trial and all combined acceptance                                 |
| Prism program                | Program only                      | Source stages, schema, captures                       | Shaped output and all combined acceptance                                 |

Concrete component ownership, using current field names:

| Offered part               | Existing fields owned                                         | Additional dependency rule                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTML selection             | `selector`, `fields`                                          | A change invalidates resource-reference projection validation and its derived URL observations, even if stored path and navigation remain unchanged                         |
| HTML navigation            | `links`                                                       | A change discards dependent learned descendants and recomputes logical BFS                                                                                                  |
| Conditions                 | `preconditions`                                               | No permission to change selection/navigation                                                                                                                                |
| Resource processing        | `result.input.reference` or null as allowed by the fixed task | `result.flow` is fixed by task/host and not model-writable; the path is retried against current selected items                                                              |
| XML reference extraction   | `reference.xml`                                               | A change invalidates its reference-program trial/derived links and dependent descendant stages                                                                              |
| JSON/XML reference program | `reference.mapping`                                           | Its `links` and `resources` outputs retain the existing reference contract; changed links invalidate descendants, changed resource values invalidate resource/bundle trials |
| Reference identity         | `reference.id`, `reference.format`                            | Assigned by JSON from stage/binding, not editable model flow identifiers                                                                                                    |
| Generated schema/output    | Existing ordinary schema / Prism config                       | No change to source acquisition authority                                                                                                                                   |

For a reference-program edit, recomputing descendants conservatively is allowed even when only resource values actually changed; do not add a generic semantic program-diff engine to optimize that case. JSON standalone data has no reference-extraction component. XML data extraction uses its existing XPath rule; its candidate focus and dependency behavior follow the same extraction-to-shaping rule without inventing child records.

Changes are whole named-component replacements, not a JSON Patch/AST rewriting language. The JSON workflow implements this finite table; native code does not decide edit scope.

Changing navigation does not unspend prior HTTP work. Previously acquired captures and canonical aliases may be reused, but all charged page/resource allowances remain charged. New destinations must fit the remaining caller ceilings. No automatic heterogeneous-layout routing is added: each frontier retains current format/layout contracts and explicit refusal where unsupported.

Mechanical error observations identify the producing component because JSON invoked that component's checker. The workflow focuses it without rewriting unrelated data. Semantic review cannot mechanically locate an error from prose; the same author receives the complete current component/trial manifest and selects an offered focus through inspection.

A ready action uses only the stored current tested draft. It cannot carry a final untested replacement. At most the initial review plus one reconsideration is allowed. Reconsideration requires either an admitted draft edit or a new successful mechanical source observation obtained after the rejection and supplied to the reviewer. This permits disputing a mistaken source-unit interpretation without corrupting an already-correct artifact.

Unchanged candidate plus unchanged evidence cannot be resubmitted. A repeated identical source/query/window observation does not qualify merely because it has a new transcript index. The existing short observation list can compare those ordinary fields directly; no hashing/cache/catalogue is required. The author states which rejection the new observation addresses, but that statement is not an oracle: JSON checks provenance/freshness and the reviewer judges relevance. The same two-pass and remaining-step/time limits apply; this is not another judge or unlimited vote shopping.

## 12. Acquisition, traversal, resources and search

Keep breadth-first traversal, whole-run visited/alias state, sequential alias admission and explicit redirects. Models propose reference rules; existing JSON acquisition executes them. No inspection action can fetch a URL or bypass depth/page/resource ceilings.

Discovery's charged acquisition set is not the current draft's processed set, as defined in §6. The final fresh complete trial is a separate explicit verification run of the proposed artifact, using its own target/resource counts under the same caller ceilings. Its HTTP/resource work is reported separately and cannot be hidden as cached-source inspection. If a product needs one aggregate network ceiling across discovery and verification, that is not supplied by the current public per-artifact page/resource fields; this target does not pretend otherwise.

Source trials use existing owned captures and parser identity. Selection previews can show reference values without fetching them. The existing final resource flow verifies declared downloads with bounded bytes/media/transport checks. Downloaded-content extraction remains unavailable.

JSON/XML reference stages retain their existing grammar and refusals: one format per frontier, no implicit terminal mixed JSON/XML results in reference traversal, no XML xml:base support. HTML field recursion is not invented by proposing a nested result schema. If current source data plus Prism cannot produce a proposed target, revise a generated target/source rule under the same instruction or finish unresolved; never weaken caller semantics.

Search continues to call the public discovery contract for each chosen destination. DuckDuckGo acquisition never consumes destination link depth. First-page search, ordering, query rewriting and optional recovery retain their present owners. The target introduces no search-specific policy in page discovery.

## 13. Budgets and failure behavior

One shared author allowance spans task interpretation, observations, source proposals, automatic schemas, Prism and corrections. There is no fresh allocation at every phase/stage or repair. Every Cortex model step, including recovery/invalid termination, consumes it. Mechanical inspections are already bounded by the author turns and native reader/engine allowances; do not add an overlapping global counter for every operation without a distinct reason.

Proposed initial comparison profile, entirely JSON-owned:

```json
{
  "author": { "maxModelSteps": 12, "maxResponseAttempts": 3, "maxModelMs": 300000 },
  "review": { "maxPasses": 2, "maxModelSteps": 4, "maxModelMs": 60000 },
  "observations": { "maxBytes": 65536 },
  "maxInputBytes": 524288
}
```

These are proposed policy defaults, not native constants or claimed optimal values. `maxResponseAttempts` is per Cortex invocation, never the global budget. Before each author call, JSON sets Cortex maxSteps and outputAttempts to `min(maxResponseAttempts,remainingAuthorSteps)` and maxMs to remaining author model time. It then subtracts that invocation's reported steps and elapsed model time exactly once. Task/schema/Prism/inspection decisions and all Cortex recovery steps share these totals. Missing metadata prevents further model calls conservatively. A failed Cortex response after its bounded recovery returns unresolved; JSON does not restart a fresh three-attempt invocation automatically.

Reviewer maxModelSteps/maxModelMs are aggregate across both allowed passes, not fresh limits for each. The same per-invocation cap is bounded by the remaining review steps/time. Do not reuse a three-attempt global output allowance for a twelve-step multi-phase conversation: the current model-allowance semantics subtract successful outputs too. Reuse ordinary Prism subtraction/current metadata, not an unchanged inappropriate budget initialization. The target retires superseded per-component semantic candidate-attempt counters rather than layering them all underneath the shared loop.

Keep 120b/high reasoning/temperature1/topP1/emit unless separately approved. Caller page/resource limits remain independent and cannot be traded for model budget.

SDK retries after actual provider rate limits are existing transport behavior; a Cortex step is not a promise of exactly one HTTP provider attempt. Do not expose an unsupported provider-attempt knob or add preemptive quota reservations. Record actual provider attempts, usage availability and rate-limit waits separately. The caller's whole-run signal/deadline covers waits and all effects.

Observation bytes bound one displayed result. Request bytes bound assembled model input. They do not guarantee model token counts. Unsupported formats/capabilities, insufficient context, exhausted allowances and unexpressible targets produce explicit unresolved outcomes; cancellation/integrity/audit failures retain their existing terminal behavior and cannot publish late results.

No complete trial or reviewer marker survives a draft edit. Publication gates remain mechanical and outside model authority. Failed proposals and observations are retained through the existing evidence callback, not a mandatory ledger.

## 14. Concrete failure-path walkthroughs

**Context versus title.** Initial structural selection exposes the complete source-supported record context, including organizer when relevant. The author observes actual matches and input values before choosing a qualification program. A title substring is not accepted as equivalent to a topic merely because it parses. No event names/IDs or golden expected selections enter model context. Whether a better general rule can be learned is an empirical question, not guaranteed by this design.

**Invalid precondition.** A full initial stage proposal may have useful selection but an invalid duplicate condition. The next writable candidate is the conditions array. The source selector cannot change as an incidental by-product of that correction. The current full stage is retried after the conditions change.

**Release content versus navigation.** A final objection to release content returns the author the current stage manifest, actual data and producing rules. It may inspect the release stage and revise its extraction or mapping. Chronology navigation is not automatically rebuilt. The malformed-list/hash issue remains a semantic question that inspection must expose, not an assertion that DOM equality settles it.

**Infeasible generated target.** A generated nested output may compile but fail shaping with current extracted fields. That failure returns to the same author, which can inspect the extraction, add genuinely available fields or revisit the generated contract. It cannot reinterpret the caller's explicit whole-list request or supplied schema to make a trial pass. Failure before final review does not make schema revision unreachable.

## 15. Implementation boundary and deletions if adopted

Keep the engine, source readers, transport, source-preserving preparation, traversal/resource execution, static binding, Prism and the compact schema guide. Reuse their existing native operations and JSON helpers.

Replace the current entry's blind automatic-contract timing, isolated one-shot stage handoffs and whole-tree semantic restart with the JSON authoring workflow. Replace full-rule rewrites after component failures with scoped proposal contracts. Keep one final guard, not another verifier. Selection, conditions, reference and shaping checks stay in their owning mechanical/JSON contracts.

Delete the separate HTML navigation semantic-review path; its mechanical progress facts go to the same source author. Delete superseded per-component semantic attempt counters when the shared author loop owns those attempts. Cortex's per-response output recovery remains. These are explicit target deletions, not optional retired adapters.

`discovery.json` remains the orchestrator. `mechanical.json` remains the static executor. Native author operations share typed factories and perform no inspection dispatch, candidate acceptance, retry scheduling or publication callbacks. One scoped HTML-view operation is the only newly required source capability; generic action wrappers are boundary schemas, not a plugin system.

After adoption, remove the superseded discovery path, unused helpers/prompts/tests and any temporary comparison switch. Do not preserve it behind a public strategy option or compatibility alias. Preserve failed captures, historical measurements, credentials and Git history. The baseline can be a frozen local package/source evidence snapshot used by the comparison runner, not a second production implementation.

Strata continues to version executable JSON documents with existing engine/Prism stamps. Action contracts belong to their owning discovery workflow/typed operation; no parallel schema catalogue or version service is introduced.

## 16. Verification and adoption decision fixed before implementation

First correct future grading: numeric visited counts versus URL arrays; automatic representation equivalence; known SQLite unit/hash ambiguity; separate useful partial results from wrong publications. Freeze the revised criteria before either comparison arm runs. Historical inputs, criteria and scores remain intact. If an instruction/expected-value contract is clarified, declare a new suite revision and use it identically in both arms; never silently regrade the old panel.

Freeze the current complete implementation as the baseline: the historical 5/10 predates the latest guide. Use **12 discoveries per arm, 24 maximum**, not an open-ended tuning campaign:

- Existing five task families × supplied/automatic schema: 10.
- Existing XML → linked HTML → PDF task × both modes: 2.
- Same original captures, instructions, caller ceilings and declared schemas for both arms; fresh model answers, no expected IDs/counts/labels in prompts. Provider, model, reasoning, sampling, emission mode and completion allowance are identical. Freeze both algorithm-specific budget profiles explicitly: the candidate's shared allowance intentionally replaces the baseline's per-component allowances; do not describe those differing policies as identical settings.

This comparison uses fresh model responses against frozen complete source/transport fixtures, including resource bytes. Its URL-artifact trials exercise the ordinary mechanical path through that frozen transport; they are not fresh-web verification. Changed-source executions use the separately frozen mutations. Report the required live mechanical PDF check separately rather than describing the comparison as live discovery.

Before either arm, implement and freeze this mandatory offline mutation matrix independently of emitted artifacts. Preserve source layout, field association and the stated namespace URI in in-scope variants. The published artifact's preconditions cannot redefine a changed title, date, version or filename as out of scope. Every returned artifact executes these variants without AI; refusal on an in-scope variant is failed reuse, not an honesty pass. An unpublished artifact receives no implicit reuse pass.

| Family                     | Mandatory in-scope variants                                                                                                                                                                                                                                           | Separate honesty controls                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meetup records             | Change titles/casing with organizer/topic/city/month context preserved; add an eligible same-shape card whose relevance is contextual; add an unrelated substring counterexample; change an event outside the requested month; no eligible cards with layout retained | Broken record layout; missing caller-required source value                                                                                                       |
| SQLite chronology/releases | Change versions/dates/change text; change and add release links/pages within caller ceilings; change list lengths/nested content under a predeclared source-unit rule                                                                                                 | No chronology links when the request requires releases; broken source units; hash/footer ambiguity must be resolved in the revised fixture contract before calls |
| PostgreSQL version records | Change versions/status/dates; add supported and unsupported rows; empty body with headers retained                                                                                                                                                                    | Broken column association                                                                                                                                        |
| JSON components            | Change names/status; reorder/add ordinary and group records; remove all qualifying records                                                                                                                                                                            | Invalid JSON or independently declared incompatible structure                                                                                                    |
| Atom XML entries           | Change titles/timestamps/links; add entries; reorder link relations; replace namespace-prefix spelling with the same URI; empty feed                                                                                                                                  | Different namespace URI or malformed XML                                                                                                                         |
| XML to article to PDF      | Change/add article links, PDF names/targets and PDF bytes within caller ceilings; equivalent namespace prefixes; empty source feed for the existing every-paper instruction                                                                                           | Unsupported mixed terminal formats, malformed XML or invalid download bytes                                                                                      |

For the resource family's supplied-schema mode, declare a dynamic ordinary schema for the requested result data before calls, and grade resource bytes/media independently outside `data`. Automatic mode may choose a different equivalent data representation. Do not force resource byte objects into the result contract or treat a schema-valid URL as a successful download. This is a test contract, not a new product field vocabulary.

Fixtures, supported envelopes, expected associations and format-specific representations must be implemented and preflighted before the paid freeze. The matrix is a specification, not evidence that those tests already exist. Automatic field names/wrappers may differ when meaning and required coverage are equivalent. Do not change expected results to accommodate the emitted program.

Outcome categories have operational meanings:

- **Complete/correct:** source-supported values and associations satisfy the instruction and supplied/generated contract, including the independently declared required coverage.
- **Useful partial:** source-supported results satisfy a non-exhaustive list request or declared bounded scope, but omit useful source-supported items. Report coverage separately; this is not automatically an incorrect publication.
- **Incorrect publication:** a returned artifact violates an explicit exhaustive requirement, a required caller-contract value, or source-supported meaning through wrong additions, values, duplication or association. A known mandatory omission cannot be relabelled useful partial.
- **Unresolved:** null artifact, concrete reason and any last captured bundle trial at the public diagnostic boundary. An unexpressible target cannot be replaced with a broader claim of completion.

The independent benchmark can measure completeness unavailable to the runtime. These categories add no expected-answer verifier or native semantic oracle to the library.

Report separately: complete/correct, useful partial, incorrect publication, unresolved; relevant coverage/additions/duplicates/association; caller-contract fidelity and automatic representation; reviewer false positives/negatives; publication; same-source and changed-source execution; request/observation counts, input/output/reasoning tokens, actual waits and total time.

Proposed GO gate, requiring all conditions:

1. At least 8/10 core cases fully correct and at least two more than the fresh baseline. A baseline with insufficient remaining headroom makes this panel inconclusive for a substantial-quality refactor; it does not justify inventing easier post-hoc criteria.
2. Zero incorrect published artifacts in all 12 cases; no regression in baseline complete/correct cases.
3. Both resource-chain cases correct.
4. All mandatory in-scope mutations for published artifacts correct without AI. Report eligible/executed/passed variant counts and artifacts without variants because they were unresolved. Explicit maintenance failures on in-scope inputs are failed reuse, not passes. Out-of-scope layout refusals are honesty observations, not corrected extraction.
5. Zero permission, cancellation, integrity or acquisition-budget violations.
6. At most 2× baseline aggregate provider attempts, input tokens and output tokens, inside the declared per-case budgets. Correctness outranks speed; report latency without requiring faster discovery.

Run the fresh baseline first. If its core result is 9/10 or better, the required improvement is impossible: stop before candidate paid calls and report the comparison inconclusive under this gate. During the candidate arm, stop paid work as soon as a hard permission/integrity violation, incorrect publication, cost-ceiling breach or mathematically unreachable quality gate occurs. Twenty-four is a maximum, not a spending obligation. Do not tune the next case after seeing an earlier answer.

Every successful provider response must have recorded usage to pass the cost gate. Missing successful-response usage makes that comparison inconclusive, never zero. Record unsuccessful attempts such as HTTP 429 separately with unavailable usage where applicable, together with actual waits; do not claim their unknown token cost is zero or conflate them with reported completion usage. Preserve raw request/response evidence and stop on audit failure.

A clean panel supports adoption of this direction, not universal reliability. Steam unrelated-offer and 7-Zip frozen-version evidence remain visible unresolved counterexamples; preserving their old failures does not count as fixing them.

If the gate fails, stop. Produce one architectural diagnosis against this design and choose reject, materially redesign, or leave the present library with stated limits. No rolling prompt changes, extra retries, changed grading or another panel to chase the target. A new design/experiment needs a fresh explicit decision.

## 17. Review and implementation checkpoints

This complete design receives independent NISC/mechanism, model-interface/repair and evidence/product review before implementation. Reviewers cannot authorize architecture. User approval covers the concrete target, deletion plan and comparison contract.

If implemented, build the coherent authoring path inside the actual library, using existing primitives and focused offline tests; do not ship unrelated example runners as proof. Include offline search-to-discovery integration against the public result boundary; this does not authorize a paid search batch, search-ordering change or CAPTCHA redesign. At integration use the established four roles: NISC alignment, generic grammar, correctness and quality. Fix modest findings, then run typecheck, full offline checks, required mechanical PDF and isolated package checks. Re-review only material redesign or unresolved risk.

Only then run the single frozen comparison. The destination stays this design and its measured product objective; implementation increments and individual failing pages do not become new architecture by accumulation.

## 18. Design review closure

Three independent roles reviewed the complete proposal and then checked their concrete closing findings against the revised document:

| Role                   | Material findings resolved in this design                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NISC/mechanism         | Finite phase/focus transitions; format-specific component ownership; acquired history versus draft traversal; explicit removal of navigation semantic review; complete-subtree inspection limits                |
| Model interface/repair | Evidence-based bounded reconsideration; exact observation/focus forms; aggregate versus per-response budgets; standalone Prism documentation scope; resource projection ownership; terminal fresh-trial failure |
| Product/evidence       | Stable unresolved/partial diagnostic boundary; mandatory independent reuse matrix; operational outcome categories; explicit comparison settings, early stops and unavailable usage                              |

All three confirmed their consequential specification gaps closed and found the target coherent enough to implement without inventing a new architecture during coding. They did not certify accuracy, grade an implementation that does not exist, or authorize implementation. Confidence in substantial end-to-end improvement remains moderate until the comparison meets its gate.

At design-review closure, all 88 files recorded in `data/runs/schema-authoring-models-2026-11-01T16-19-29-925Z/frozen.json` matched their recorded hashes. No production changes or paid tests had then been performed. Implementation results are separate evidence; that historical design-only check does not certify the replacement.
