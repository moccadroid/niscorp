# Discovery and engine simplification — 2026-10-30

The user explicitly authorized simplifying both discovery and the engine. This supersedes the previous engine-untouched constraint for this correction. No paid Groq/Jev discovery calls, new dependency, database, persistence system, native planner or second evaluator were added.

Baseline is the actual working tree at the beginning of this request, including the preceding builder correction; it is not an older favorable commit. Evidence, original source snapshots and final measurements are under `data/runs/elegance-reset-2026-10-30`.

## What changed structurally

- The engine gained literal artifact data, pure calculation steps and computed check names through its existing interpreter and Prism compiler. Engine TypeScript increased 851→893 lines. Its native policy surface did not grow.
- Learned scalar rules/preconditions now change literal data; static root/helper programs stay identical. The per-condition AST construction, preconditionStep/outputMappingBinding templates and bind-references rewrite flow are deleted.
- Actual learned mapping/reference programs still become ordinary admitted helper outputs. Finished rule data no longer duplicates their executable mapping. Small finite static linking remains; no dynamic execution/registry replaces it.
- Pure steps replace nested calculations and one-use forwarding helpers. Traversal, publication, URL collection and model allowances compute shared facts once.
- The starting acquired capture is reused for authoring; mechanical stage/final trials remain separate. An explicit regression protects that distinction.
- Four native model wrappers share one schema-only factory. Native HTML measurement reports arbitrary query facts and unknown totals after errors. All roles, thresholds, permission, acceptance and repair remain JSON.
- Removed unused match-HTML serialization, preview fields and resultBytes/matchLimits settings. Diagnostics use one direct nullable policy.
- Search has one original/recovered page reader, one option resolution, one candidate/history union and one URL parse for ordinary direct destinations. First-page/ceiling/wrapper/recovery contracts are unchanged.
- Structural Zod validation no longer recursively repeats Prism expression validation. `prepareArtifact` still completely admits all expressions, helpers and schemas before effects. `ArtifactSchema.parse` alone is structural, not complete executable admission.

## Source size and real complexity

Final source uses the existing formatter's short-object collapse option for JSON. That makes artifacts easier to read but is not counted as architectural deletion. All 20 parsed source JSON trees were proved identical across the formatting-only step. Five subsequent double boolean negations were removed separately and normal checks repeated.

| Part | Physical lines before→final | JSON objects before→final | Conditional expressions before→final |
| --- | --- | --- | --- |
| Main discovery | 4,941→2,465 | 1,586→1,210 | 44→27 |
| Candidate builder | 2,255→1,165 | 712→587 | 10→6 |
| Mechanical programs | 3,847→2,394 | 1,134→1,284 | 18→22 |
| Search | 1,725→745 | 563→448 | 4→4 |

Before short-object formatting, main discovery was 3,846 lines and candidate builder 1,839. The mechanical program grew because static execution templates became explicit. Do not present the physical line reduction or the binder's reduction as the whole architectural reduction.

Across all source JSON: object count 5,035→4,555 (9.5% fewer), compact bytes 155,859→145,938 (6.4% fewer). Across all native TypeScript: 4,823→4,745 lines; discovery native TypeScript 1,416→1,296. The strongest improvement is removing two-stage rule-code construction, not a claim that half the entire library disappeared.

Binding plus reference construction alone: objects 465→230, operators 281→144, cases 17→6 and quotation/construction operators 31→10. Scalar rule changes no longer rewrite executable root/helper programs; regression tests prove this independently of these counts.

## Independent final reviews

Four fresh read-only reviewers cross-checked each other after implementation. Their findings are recorded individually in `reviews.json`.

1. **Nisc alignment:** read installed Prism/Cortex/Strata contracts and the current ownership path; independently passed 14 engine-data/pure groups. No native discovery policy, data/code confusion, extra registry or execution-model path found. Required explicit structural-schema versus complete-admission documentation; it is now in the public API/builder documents.
2. **Execution/correctness:** independently passed engine-data14, reference23, search7 and ownership11. Checked permissions before HTTP, unknown-stage refusal, aliases/budgets, cancellation/publication, one recovery and evidence handling. No blocker. Required distinguishing reported model time from whole-run mechanical time; documented.
3. **Code quality:** independently compared source and object/operator structure. Confirmed actual deletion of metaprogramming, duplicate validation, unused previews and repeated factories. No blocker. Insisted that static template growth, remaining helper preparation costs and modest whole-system shrink be reported rather than hidden behind the binder result.
4. **Generic grammar:** independently passed 14 engine-data/pure groups and checked strict step forms, version embeddings, literal data, query facts and shared allowances. No site/business grammar or second interpreter found. Finite reference-program linking remains justified.

These are code/mechanics reviews, not fresh discovery-accuracy reviews. No numerical grade was inferred from them.

## Verification

The final `pnpm typecheck` and `pnpm check` passed. Relevant groups include existing engine14, new data/pure14, discovery45, JSON6, XML6, reference23, search7, recovery5 and builder ownership11; the support tests pass 21/21. Existing source/field/encoding/redirect/permission/review/cancellation and known wrong-result checks remain.

Six saved authoring cases preserve their outcomes: three failures rejected, three candidates mechanically unchanged. This does not prove Comic Con relevance or successful model repair. Original captures and historical grades are unchanged.

The packed package installed outside the checkout, declarations/imports passed and two real old returned artifacts replayed four times with model imports forbidden. This separately verifies engine0 compatibility; new engine1 data/pure behavior is covered by the offline tests. Evidence: `data/runs/package-HA8SQO`.

The HTTP-only PDF regression passes: 116,547 verified bytes, no models. Evidence: `data/runs/live-pdf-2026-10-30T17-02-01-477Z`.

## Execution measurements

Compiled production engine, 40 interleaved samples after warmup, same validated native operations and output shape on both paths:

- 1,000 calls to a number-increment operation: direct calls 0.0993ms; prepared JSON artifact 0.8835ms. Preparation/startup/HTTP are excluded.
- Loopback HTTP page, selection and two downloads: direct sequence 1.1221ms; artifact 1.2106ms. This is local HTTP, not internet latency.

Separate same-process before/after source comparison: 1,000 pure calculations formerly expressed as helper calls took median0.5678ms; pure value steps take0.3216ms. Preparing 1,000 distinct inline expressions costs more than compiling one shared helper body: repeated median26.3753→34.2470ms. This is a real compile/reuse tradeoff, not a blanket speedup. Ordinary native-call execution remained comparable. Methods/raw results are in `engine-compare-v2.json` and `benchmark-final.txt`.

## What remains

Traversal/aliases, permissions, formats, fields, bounded resources, review/publication and explicit failure behavior still require JSON. Reference program linking and shaping-source aliases retain small named-template coupling. Whole helper bundles have preparation cost. No runtime AI, new registry or extra native policy was added to conceal these costs.

Steam wrong-offer, 7-Zip version and past fresh-discovery failures remain accepted semantic limits. This correction does not claim perfect discovery, complete results or reliable future reuse.
