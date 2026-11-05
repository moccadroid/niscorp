# XML discovery

XML uses the same public entry, HTTP acquisition, JSON format catalog and final acceptance boundary as HTML/JSON. Defaults accept application/xml, text/xml and +xml, excluding application/xhtml+xml so XHTML remains HTML.

`xml.inspect` supplies original decoded XML. No whole-tree JSON conversion or HTML cleanup occurs. For standalone extraction, the dedicated source job receives the current frontier and either inspects an offered XML source or proposes `{selector,namespaces,fields}`. For reference following, that same XPath-only source job proposes the selection. Mechanical selection supplies actual `{url,items}` to the published Prism mapping agent, and JSON assembles `{xml,mapping}`. JSON executes the combined trial, returns identified mechanical feedback and commits success automatically. A successful XPath alone cannot advance a reference stage. No finish, component-navigation or value-inspection action is offered.

Selector is XPath 1.0 for record elements. Namespaces binds arbitrary XPath prefixes to namespace URIs, including default source namespaces. Fields maps dynamic names to relative XPath expressions. The own key `__proto__` remains unsupported because the boundary schema library drops it.

`xml.select` returns `{url,items}`. String/boolean/finite-number XPath results are scalars; node-set fields are ordered arrays of XPath string values. Empty selection is `[]`. Missing fields follow XPath semantics rather than an invented required-field policy. Only selected values cross into JSON for Prism.

Caller schemas compile before effects and remain unchanged. Otherwise a separate ordinary schema is admitted after extraction. That schema stays fixed for the bare-Prism job. Mechanical mapping failures can receive bounded correction; semantic review rejection is unresolved, not a source/schema restart.

One final-data reviewer sees actual shaped data, its distinct schema and matching original XML. A negative verdict can trigger the configured bounded repeat of the fixed author pipeline, with each job receiving its own proposal/observation history and the review feedback. Working artifacts are returned independently of that verdict; callers receive the review separately. Fresh complete mechanical verification remains required. Execution accepts `{url}`, reads current XML, checks its format, applies saved URI-bound XPath and runs Prism without AI.

## Reader mechanics

Saxes checks well-formedness/namespaces while constructing one xmldom DOM for XPath. DTDs are unsupported; external entities are never fetched. Decoding follows BOM, transport charset, XML declaration and UTF-8 precedence, with fatal decoding and explicit unsupported encodings. Original bytes remain unchanged.

The native profile owns byte/node/depth/selected-record bounds. Attributes count as nodes. Aggregate field-value/byte bounds count repeated names and scalar/node-set results. Exhaustion is terminal; models cannot increase allowances. Parsing/XPath are synchronous bounded work; cancellation is checked at operation, parse-event and query boundaries, not by interrupting one dependency expression.

Equivalent prefixes with the same namespace URI remain compatible. Changed URIs change identity and can yield valid empty output. This is namespace-sensitive matching, not automatic drift detection.

Navigation/resources compose [reference following](reference-following.md). XML xml:base, arbitrary terminal JSON/XML data leaves within reference traversal and downloaded-content extraction remain unsupported. See [the builder](discovery-builder.md) and [remaining work](remaining-work.md) for the current implementation/evidence boundary.
