# Discovery cleanup and independent audit — 2026-10-30

Scope: remove duplicate search execution and original HTML parsing; move remaining behavioral schema prose into existing JSON prompts; independently investigate discovery complexity. Engine untouched. No new machinery, website rules, model calls or paid tests. This is a maintainability correction, not a fresh discovery accuracy measurement.

Follow-up: the [optional codec and shared-decision slice](captcha-codec-discovery-consolidation-2026-10-30.md) completes the host codec correction and consolidates repeated JSON decisions. Measurements and remaining-work recommendations below describe this earlier audit; its historical results are unchanged.

## Changes and ownership

Search previously executed a published artifact after discovery had already completed its final combined trial. `search-destination` now exposes that existing trial as `execution`. No cache or alternate executor was added. A null artifact produces null execution, even where failed discovery omits its trial. HTML, shaped HTML, JSON, XML and resource outcomes retain their existing trial data. The live driver still independently replays returned artifacts as verification; that deliberately separate check is not part of search's returned execution.

HTML context preparation previously parsed the original once to validate/index it, parsed the same original again to clear payloads, then parsed the serialized output to verify structural integrity. It now clears and serializes the reader's newly created private tree. Original parsing is one pass, and the justified round-trip parse remains: total preparation parses fall from three to two. Each invocation owns its tree; original strings, captures and extraction trees remain unchanged. No cross-operation DOM cache was introduced. Existing byte/node/depth limits and cancellation still apply.

Task intent, selector reusability and precondition-authoring instructions now live in `task-declaration.json` and `discovery.json`. XML's existing JSON instructions already own reuse and Prism conversion guidance. Native schema descriptions retain field meanings, null semantics and supported syntax; schema shapes and native validation are unchanged. This does not turn parser syntax or platform capabilities into configurable policy.

## Verification

| Check | Observed result |
|---|---|
| `pnpm typecheck` | Passed |
| `pnpm check` | Passed; 120 `[pass]` groups plus 21 benchmark-support/pacing tests; no failures |
| Focused HTML preparation | 12 groups passed, including immutable sources, parsed structure, namespaces/templates, serialization failure, bounds and cancellation |
| Search connection | Six selected local destinations fetched once each; returned execution equals completed trial; changed-value AI-free replay and unresolved/null-artifact case pass |
| Saved author cases | Three unchanged bad Meetup candidates still fail; two successful controls retain three/one records; Comic Con still mechanically passes with 15 records |
| Independent critic | No material issue in cleanup diff; requested explicit documentation that execution is the completed trial |
| Required HTTP-only PDF check | Passed; 116,547 PDF bytes, 301 redirect handled, no models available |
| Model/paid requests | Zero |
| Engine changes | Zero |

Saved-case context matches extraction's parsed structure on all six cases. Comic Con's mechanical pass does not prove semantic relevance; no fresh semantic review was performed. This cleanup does not fix the previously observed broad-event false acceptance or improve its historical score.

Evidence: `data/runs/discovery-cleanup-checks-2026-10-30.txt`, `data/runs/discovery-cleanup-saved-cases-2026-10-30.txt`, `data/runs/author-repair-offline-2026-10-30T12-03-27-347Z/summary.json`, and `data/runs/live-pdf-2026-10-30T12-06-55-833Z`. PDF preparation 39.79 ms; run 1,907.50 ms including HTTP. These numbers are not a local engine overhead benchmark.

## What 5,778 lines means

`src/discovery/discovery.json` contains 34 explicitly declared steps across an entry flow and ten helpers, not 5,778 operations. Traversal can execute those steps repeatedly. Four helpers contain expressions without operation steps. Current size: 203,216 pretty-printed bytes versus 50,280 compact bytes; about 75% formatting whitespace. There are 448 `$ref`, 149 `$get`, 41 `$case` expressions and maximum JSON nesting depth 36. That nesting includes expression objects/arrays; it is not runtime recursion depth.

The independent critic measured the following responsibility breakdown before the prompt-only edits; line boundaries and total line count remain unchanged:

| Responsibility | Lines | Purpose |
|---|---:|---|
| Entry | 1,504 | Profile/request bounds, task declaration, first acquisition, format routing, publication |
| `learn` | 1,070 | Traverse frontiers, learn each stage and aggregate state |
| `bind` | 978 | Construct the finished executable artifact |
| `attempt` | 752 | Author, bind candidate, mechanically trial, review |
| `bind-references` | 633 | Construct JSON/XML reference-extraction helpers |
| `rule` | 492 | Prepare model context and run initial/repair attempts |
| Five smaller helpers | 301 | Acquisition/context wrappers and projections |
| Outer structure | 48 | Containers |

Before this cleanup, all nine discovery JSON files together were 12,604 lines/114,821 compact bytes. Current native discovery is 17 TypeScript files/1,502 lines. Native files provide contracts, Cortex/model transport, HTML context/diagnostics/validation, XML authoring, trials and operation composition. The large JSON program is not the native engine, nor is the entire program sent to a model.

## Remaining findings

### Repeated decisions

The critic identified nine copies of the navigation/resource predicate, five copies of the larger HTML/reference route and four learned-stage readiness checks. Publication acceptance is reconstructed for separate output fields. Trial qualification is also repeated: a full all-trials-success expression appears twice and its individual bad-trial test three times. Outer operation success and inner artifact-trial success are distinct, but repeatedly decoding them makes drift likely.

Next bounded consolidation: calculate each shared route/qualification/publication value once using existing JSON/Prism bindings and reuse it. Preserve raw outcomes and existing failure semantics. No engine changes or new operators. Verify HTML/JSON/XML, shaping/reference branches, failed authors/trials/reviews, accepted repairs and cancellation offline. Every failed/cancelled path must still prevent publication.

### Fragile template binding

`bind` and `bind-references` account for 1,611 lines, about 28% of the file. They generate executable JSON. One precondition binding writes through this positional path into another template:

```text
each → items → $slice → from → $filter → when → $eq → 1 → $const
```

Changing that expression to an equivalent form could break binding. Reference binding has similar positional updates. The issue is coupled expression structure, not JSON itself. A later separate refactor should bind shallow named template inputs rather than expression internals. Preserve exact failed-condition identity, canonical property order, declaration deduplication and stage membership; their current contracts are documented in `docs/development/discovery-preconditions.md`. Do not replace this with a native compiler or discard diagnostics just to shorten the file.

### Weak internal shapes

Several helpers only declare object input/output schemas. Consumers compensate with deep lookups, fallbacks and repeated status checks. Normalize a few shared results at their producer and document their stable shape before simplifying consumers. Missing Prism `$ref` paths throw; replacing all fallback lookups mechanically would be incorrect. Keep external boundary validation; do not create a second intermediate-schema framework.

### Unused bundled helper data

The previous Vienna artifact-0 contained 13 bundled helpers; nine were reachable through its literal calls. Four unused helpers totaled 5,521 compact bytes, approximately 20% of that artifact's compact representation. They are inert data, not evidence of extra execution or seconds of overhead. Lowest priority: explicit JSON bundles for existing modes could omit unused helpers. A reachability compiler, catalogue or runtime dependency resolver would cost more complexity than it removes.

## Assessment and sequence

The inspected design still follows JSON artifact → in-memory engine → data. No database, native planner, website branch, execution AI or competing JSON recovery loop was found. Cortex retains typed-output recovery. However, declarative wiring is not yet lean enough to call elegant. Keeping decisions in JSON does not excuse copying them or reaching deep into another expression's structure.

The approved duplicate work/policy cleanup is complete. Recommended next slice is only shared routing, qualification and publication calculations in existing JSON. Review behavior offline before touching binder structure. Template binding needs a separate comparison because error identity and canonicalization matter. File splitting/minification can wait: neither reduces logical duplication. No wholesale discovery rewrite is authorized by this audit.

## What point 5 meant

The optional CAPTCHA test host is Windows-specific. `scripts/search-image-adapters.mjs` calls `pwsh.exe` and a System.Drawing script under `benchmarks/captcha-evaluation/prepare-images.ps1`. That script pads images, writes PNG assets and creates a contact sheet. Jev decides which pictures match; the script does not make that decision. The core entry only accepts host-supplied image preparation, vision and form-submission callbacks and installs no browser or codec.

The remaining issue is packaging/portability of that host implementation and its dependency on a benchmark file. A Linux host needs another compatible implementation through the existing injection contract. This requires no new core machinery. It was not used in the latest live query and was not changed in this cleanup.
