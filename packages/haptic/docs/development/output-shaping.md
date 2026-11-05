# Result contracts and Prism shaping

Every discovery artifact has an ordinary JSON Schema for `result.data`. Fields and record shapes are dynamic. Caller `outputSchema` takes precedence unchanged and compiles before effects. Without one, the separate schema author runs after captured source extraction, using the original instruction, optional reference time and available capabilities. JSON attaches the fixed 2020-12 dialect to its typed ordinary body.

Unsupported keywords, references and dialect declarations are not offered to automatic authoring. Caller schemas retain their broader admitted support, including local references. Invalid automatic declarations receive compilation feedback within the shared author allowance. Once admitted, the data schema is fixed for mapping; shaping failure does not silently revise it or weaken the request.

## Actual mapping input

HTML supplies `{records,visited,limited,resourceUrls}`. `records` is a flat list in page/document order; each HTML selection retains its native text/attributes/path and optional dynamically named fields, plus `sourceUrl`, `baseUrl` and `encoding`. Reference traversal can also supply `{reference}` records with that same provenance. Both record shapes are strict. A field value is an array of strings/null. Standalone JSON supplies `{document,url}` with the original parsed native value. Standalone XML supplies `{url,items}` containing only XPath-selected values. This is extracted input, not a universal JSON conversion of original HTML/XML.

HTML selection adds `references.attributes`, dynamic `references.fields` and aligned `referenceErrors` for configured URL attributes. The shipped HTML format declares `urlAttributes:["href"]`; omission or `[]` disables this projection. Existing `url.resolve` uses the selection's effective base and encoding. Raw fields and attributes stay unchanged; invalid references become null with diagnostics. Control failures remain terminal. Both discovery's captured mapping input and finished execution use this same projection. JSON/XML values are unchanged. These are intermediate mapping records; Prism and the result schema still own final `data` and whether diagnostics appear there.

For page/reference traversal, the same shared `output-source` helper also supplies `resourceUrls`: the final response URLs of resources actually acquired under the caller's allowance, or `[]` when none were acquired. These are transport-derived URLs, not candidate links or a claim of content identity. Discovery's captured input and the finished artifact's `shaping-source` use the complete same helper and output contract. Standalone JSON/XML input shapes remain unchanged.

The output mapping job uses the published `mappingAgent` from `@niscorp/prism/agent`. Its ID, system instructions, output schema and documentation are retained unchanged. Haptic's thin adapter supplies actual execution examples, the fixed result schema and JSON-owned task requirements as user context. The shared model runner configures the output strategy and execution allowances from JSON. Cortex owns malformed/schema-invalid recovery; JSON owns mechanical trials and their feedback. No local Prism agent or documentation builder remains. JSON reference mapping uses the same published agent. XML reference mapping uses this same published agent after the source author supplies XPath; JSON assembles and trials `{xml,mapping}` together.

Mapping paths start at mechanical `$.input`, such as `$.input.records` or `$.input.document`. Authoring context, source bodies and schemas are not runtime input paths. Prism cannot recover records discarded by source selection or inspect unextracted child structure. Source selection must retain the units, associations and contextual fields required for qualification.

Both JSON reference and output writers receive examples through the same JSON `program-context` helper. It shows independent `{input: nativeValue}` execution scopes, rather than bare values accompanied by a prose instruction to add `input`. Its example array is not the runtime input. The shared example helper changes model context only. HTML flattening is a separate mechanical JSON projection in `output-source`; captured authoring and finished execution use that exact same helper. Native reader outputs and existing embedded artifact helpers remain unchanged. XML reference following authors XPath over original XML, then passes actual selected values to the published mapping agent and trials the assembled pair; see [reference following](reference-following.md).

## Binding and mechanical correction

The existing static shaped root calls `output-extract`, `shaping-source` and `output-data`. Literal artifact rule data remains unchanged; the learned program is an admitted helper output. The effective result schema remains at its own boundary so local references keep their meaning.

Each proposed mapping executes the complete bundle against owned captures. A schema/execution failure returns concrete mechanical feedback to the same mapping job under the remaining global author allowance. This correction does not restart source acquisition, alter caller permissions or invent a new schema. Failed attempts remain observable.

Resource bytes and full response metadata stay outside model mapping input. Only `resourceUrls` is projected into the extracted mapping input; the caller's result contract and Prism program still determine final `data`. Original resources remain separately available outside final `data`. Acquisition, aliases and charged resource allowances retain their existing ownership across trials. The later fresh verification is a separate artifact run under its own resolved ceilings.

## Review and publication

One final-data reviewer receives actual shaped `data`, a separately named result contract, matching windowed prepared HTML/native JSON/original XML evidence and actual traversal scope. It can request an HTML inspection of an offered owned capture, or finish with `{accepted,reason}`. HTML views carry explicit scope, omissions and continuation; inspection never acquires URLs. JSON retains the reviewer history and charges the original review allowance. A missing verdict or impossible display produces unavailable review and preserves a working artifact. It judges source-supported meaning; schema syntax and execution have already been checked mechanically.

The existing limit context includes the same acquired `resourceUrls` plus `resourceRedirects` containing only each recorded response's URL, status and Location values. These facts explain changed download targets; they provide neither extracted file content nor proof of task relevance. Full headers, bodies and encoded bytes are not sent. No additional reviewer, request or HTTP step is introduced.

A negative verdict can trigger the configured bounded repeat of the fixed author pipeline, with each job receiving its own proposal/observation history and the review feedback. Working artifacts are returned independently of that verdict; callers receive the review separately. Fresh complete mechanical verification remains required. Mechanical trial failure prevents publication. The earlier verdict does not semantically certify fresh values or future reuse.

Successful discovery returns a reusable artifact and final trial. Unresolved returns a null artifact; any `partialTrial:{outputSchema,outcome}` is diagnostic. Scalars, arrays, false, zero and null are valid when the contract permits them. Success depends on admitted status, never config truthiness.

Finished execution accepts `{url}`, reads current data and runs the saved program through the prepared engine without AI. Schema-invalid values retain ordinary INVALID_VALUE errors; declared precondition failures retain CHECK_FAILED. No new error framework or mandatory persistence is introduced.

The current fixed pipeline needs its own focused model evaluation. Older shaping measurements and the failed universal-controller comparison retain their original outcomes; they do not establish current accuracy. See [builder ownership](discovery-builder.md) and [remaining work](remaining-work.md).
