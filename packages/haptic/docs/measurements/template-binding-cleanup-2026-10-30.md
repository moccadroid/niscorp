# Template-binding cleanup — 2026-10-30

Scope: simplify the remaining artifact binding within existing JSON/Prism. Engine, native operations, model prompts/settings, permissions and dependencies unchanged. No paid/model tests or website-specific corrections.

- The shared mechanical precondition template consumes a named `condition` variable. Binding supplies it through an ordinary Prism `$with` and shallow field merges. The positional write through `each/items/$slice/from/$filter/when/$eq/1/$const` is gone.
- HTML helper construction uses one map rather than modifying the helper through two successive maps. Existing reference guards and HTML output selection retain their order/conditions.
- Reference-step changes are a named field-override object, rather than repeated nested `$update` cases. Each reference creates one bundle of its flows, step and branch; output arrays are projections of those bundles. This does not claim one total array traversal or measured latency improvement.
- Bound conditions remain canonicalized/deduplicated, stage-specific and executed at most once per declared condition. Raw selection failures retain the exact condition ID. `$const` still protects bound declaration data.

| Measurement | Before | After |
|---|---:|---:|
| Discovery JSON lines, same formatting | 5,310 | 5,195 |
| Compact discovery JSON bytes | 47,943 | 47,302 |
| `$update` expressions in the two binders | 13 | 1 |

The remaining update targets the named JSON Schema property `properties.resources.maxItems`, not expression internals. Mechanical JSON has the same 3,847 lines. Its template's unnamed null placeholder changed to the named variable; no operation was added.

Verification: typecheck and complete offline suite passed (128 `[pass]` groups plus 21 support/pacing tests). Focused preconditions include 28 saved-rule replays plus duplicate/reordered conditions, bounds, stage isolation, valid empty results, exact failure identity and no partial extraction/downloads. A new test changes the template's internal expression structure and verifies it still binds correctly. All 23 reference-following checks pass, covering JSON/XML, changed/added/empty links, shared bounds, resources, redirects and explicit unsupported cases. Required HTTP-only PDF regression passed afterward, without model capability.

Four independent checkpoint roles found no material issue. The grammar reviewer compared 64 binding combinations (stage/walk; no/JSON/XML/mixed references; empty/single/duplicate/two conditions; resources off/on). Reference bundles matched exactly. In 128 generated-condition contexts, behavior matched; apart from the intentional condition-expression change, emitted artifacts matched. This is offline construction/execution evidence, not new model discovery accuracy.

Exact before snapshots and focused/full offline logs are under `data/runs/template-binding-cleanup-2026-10-30/`; saved-rule details are under `data/runs/preconditions-offline-2026-10-30T14-03-13-607Z/`. Historical failed model trials and semantic counterexamples remain unchanged. This removes the identified positional coupling, not every remaining source of declarative wiring size.
