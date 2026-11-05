# Structured HTML records

The existing HTML rule may supply `fields` beside its result `selector`. Null or omission keeps native element selection. Each field name is arbitrary artifact data, with `{selector,attribute,minimum,maximum}` as its rule. No output record names or website choices belong in native code.

Those are executable rules. Discovery authors receive only `{selector,attribute,closest?}` reads; JSON supplies permissive `minimum:0,maximum:null` from the authoring profile. Thus missing or multiple field matches do not automatically discard useful records. Existing explicitly authored executable bounds retain their behavior.

The result selector identifies records. By default, field CSS operates on each record and its descendants, in source order; `:scope` explicitly identifies the record. An optional `closest` CSS selector changes one field's scope to the nearest matching element at or above that record, matched against the original document. The field's `selector` then reads only that scope and its descendants. Missing enclosing matches return `[]`; ordinary minimum/maximum checks still apply. A missing field inside the nearest scope never causes a search in farther scopes.

For example, a selected row can read a surrounding section's heading through `{closest:"section",selector:":scope > h2",attribute:null,minimum:1,maximum:1}`. The names and selectors are artifact data. This does not create nested record output or recursively select child records.

A detached selector-adapter view hides each chosen scope's ancestors and external siblings without changing, copying or reparsing the indexed DOM. Explicit descendant selectors such as `:scope *` exclude the scope itself. Existing fields without `closest` retain their exact record scope. Nested field-record grammars are not implemented.

`attribute:null` reads native text, preserving whitespace and excluding existing inert text. A string reads that exact parsed attribute. Each item's `fields` object contains arrays whose elements are strings or null. No matches produce `[]`; `[null]` means one selected element lacked the requested attribute. Native text, attributes and record path remain available alongside fields.

Minimum/maximum are inclusive bounds on selected element count per record. Maximum null is unbounded. Missing required matches, excess singular matches and inverted bounds fail with `HTML_FIELD_MATCHES` and field/selector/count details. Bounds do not enforce nonempty text or a non-null attribute value; Prism and the caller's schema own value validation and conversion. The reader never selects only the first field match. Empty record sets remain valid under the existing result policy.

There are no globally mandatory field names. `minimum:0` permits a missing field selection and returns `[]`; `minimum:1` rejects a missing selection in any selected record. Such a rejection feeds bounded author repair during discovery and fails a finished execution; it never silently drops the record. A matched element lacking its requested attribute still returns `[null]`, even with minimum 1. The author must justify positive minimums from the request or caller schema, rather than inventing required metadata. This contract is unchanged by parsed HTML preparation.

The HTML JSON profile owns `limits.maxFieldValues` and `limits.maxFieldBytes` across all fields and records in one selection. The byte allowance counts field names and UTF-8 string payloads before JSON escaping. Exhaustion is terminal, not a reason for a model to raise limits. Existing parser/selection allowances and cancellation remain in force. The unsupported own field key `__proto__` is rejected explicitly; other supported keys remain data.

## Discovery and publication

The HTML source job proposes record/field rules from the current prepared frontier, unchanged instruction and optional caller schema. Native field checks use original sources and full extraction, including records outside an inspection window. JSON returns count/field failures as mechanical feedback and narrows the offered component. Cortex owns malformed/schema-invalid response recovery. Successful proposals commit automatically; no finish action is required. Finished execution has no models.

The dedicated bare-Prism job shapes actual selected fields under the fixed result schema. One final-data reviewer judges shaped values against the original request and matching prepared evidence; it does not certify field-bound independence or future reuse. A negative verdict can trigger the configured bounded repeat of the fixed author pipeline, with each job receiving its own proposal/observation history and the review feedback. Working artifacts are returned independently of that verdict; callers receive the review separately. Fresh complete mechanical verification remains required. No separate record planner, parser language or engine change is added.

CSS selection uses the same installed css-select/domutils versions already used by Cheerio, declared as direct dependencies for their public adapter API. Original captures remain unchanged. Navigation and resource processing retain their existing contracts.

Discovery failures can include bounded parsed-HTML outlines under `profile.diagnostics`. Field errors identify the failing record; zero matches can show declared context anchors and parent/sibling structure. Omitted text is marked, payload clearing follows the existing HTML-context policy, and source captures remain unchanged. The [offline repair checks](../measurements/author-repair-offline-2026-10-30.md) demonstrate richer diagnostics and unchanged controls. The [focused fresh model evaluation](../measurements/author-repair-models-2026-10-30.md) repaired 0/3 Meetup candidates, rejected the broad candidate containing Comic Con and accepted both controls. The subsequent [parsed HTML preparation check](../measurements/parsed-html-preparation-2026-10-30.md) establishes model-view/extraction structure agreement offline, not a new model accuracy result.

## Verification

`tests/html-records.test.ts` covers field association, scope/ancestor/sibling isolation, text and attribute values, empty/missing/repeated data, explicit ambiguity failures, arbitrary keys, profile value/byte allowances, cancellation, bounded Cortex repair and AI-free changed/added/empty records through the public discovery path.

`benchmarks/html-records-suite.json` supplies two real layouts: PostgreSQL version-table rows and Django news-list entries. Caller schemas, independent grading fields and controlled changed/added HTML records are benchmark data, excluded from discovery inputs. Live results are recorded separately under `data/runs`; offline protocol coverage does not establish model accuracy or universal reuse.

## Measured integration result (2026-10-29)

Four review roles completed the checkpoint. Strict descendant scoping, mapper field declarations and a field-byte allowance were corrected and verified with normal checks. Typecheck and offline checks pass:14 structured-record groups,44 existing HTML discovery groups and19 benchmark checks.

Two returned artifacts passed captured-source, fresh HTTP, changed-record and added-record execution (8/8), with no manual artifact corrections and zero execution AI. PostgreSQL returned29 rows and30 after insertion; Django returned10 entries and11 after insertion, retaining additional links and duplicates. Fresh HTTP execution took703.98ms and145.96ms respectively. The table used a fully fresh discovery. After repeated shared-quota interruptions, Django completed through the existing recorded-candidate path: its original model selection was replayed unedited, followed by fresh declaration, review and mapping. This must not be labelled a fully fresh successful Django discovery.

Successful attempts: table4 new requests,25435 input/9708 output tokens,86.19s; Django continuation3 new requests,29670 input/7039 output tokens,79.24s. Both include approximately60s of quota pacing. The original Django author usage remains in earlier attempts. Across all attempts:27 provider requests,110271 input/30744 output tokens reported by14 responses;13 quota responses supplied no usage. The historical PDF fixture remains failed at301-versus-required302. Source, workflow and suite stayed identical throughout the paid attempts. Evidence: `data/runs/html-records-2026-10-29/verification.json`. This establishes two layouts and controlled variants, not arbitrary-layout or universal reuse accuracy.

The diagnostics model results above are dated evidence. The later [parsed-HTML model rerun](../measurements/parsed-html-model-repairs-2026-10-30.md) produced one usable Meetup repair out of three, with both controls passing; it does not establish universal repair reliability. Native fields remain additive to selected text. See [current limitations](limitations.md).
