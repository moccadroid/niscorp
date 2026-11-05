# Enclosing HTML field scope

Implemented the approved optional `closest` field property. The shared field reader finds the nearest CSS-matching element at or above the selected record, then runs the existing selector/read/cardinality logic inside that scope. Selectors, field names and bounds remain artifact data. Native code has no website, business-field or discovery policy. No engine, dependency, model setting, mapping-author or semantic-repair change was made.

The reader owns the field schema and its descriptions. Discovery authors, inspection, measurement, emitted rules and execution consume that same contract. Missing scope yields zero matches; minimum/maximum still apply. Empty selection inside the nearest scope never searches farther ancestors. Old fields retain record scope. Field errors include the optional enclosing selector. Original DOM/captures remain unchanged, with no new parse or acquisition.

## Offline evidence and review

`data/runs/html-field-closest-2026-11-02/` contains initial source hashes, the exact five-file source delta and verification. `pnpm typecheck` and `pnpm check` passed after the final description corrections. Six new behavior groups cover nested nearest groups, self matching, original-document predicates, field-scope isolation, missing/ambiguous scopes, invalid rules, optional values, old rules, changed/added/empty records, author/inspection/feedback agreement, reusable mechanical execution, cancellation and existing value allowance.

A separate controlled reader check on the saved timetable capture preserves all 19 classes' weekday, title/time, description, level and optional-note association. Its selectors are explicitly authored test fixtures, not model answers, a production rule or a correction to the live discovery. The first fixture incorrectly assumed a `main` container and selected zero records; that failed fixture is preserved separately. The corrected test-only fixture reads the actual captured container. Do not count this controlled check as automatic discovery success.

All four independent checkpoint roles graded the slice 9/10 with no material findings:

- Nisc alignment: JSON owns choices; shared native reader executes them; no additional machinery.
- Generic grammar: nearest/self/missing semantics are generic, bounded and described by the owning schema.
- Execution/correctness: shared paths, cancellation, scope isolation and old-rule behavior are preserved; six focused groups independently passed.
- Code quality: no new dependency, planner, cache or duplicate extraction; no additional refactor warranted.

The only review findings were stale broad descriptions implying fields could never leave record scope. The redundant source-prompt scope assertion was removed, and aggregate schema/documentation/AGENTS descriptions were aligned. No prompt grammar manual was added. Normal checks were rerun; no repeat reviewer cycle was needed for these modest wording changes.

The required HTTP-only PDF regression passed: `data/runs/live-pdf-2026-11-02T13-30-58-701Z`, one 116,547-byte PDF, zero model calls. All 11 engine source files remain unchanged from this slice's initial hashes.

## One fresh timetable discovery

Evidence: `data/runs/live-animafabrik-closest-2026-11-02/`. The input is byte-identical to the previous live demo: `https://animafabrik.com`, instruction `Give me the timetable of animafabrik.com.`, link following enabled, depth 2 and max pages 5. No schema, timetable URL, fields, selectors, mapping, saved source or manual correction was supplied.

**Unresolved, no artifact published.** This run stopped before the timetable page and did not test model adoption of `closest`.

| Measurement | Result |
| --- | ---: |
| Provider requests | 5 |
| Input tokens | 38,471 |
| Output tokens, including reasoning | 11,750 |
| Provider request time | 27.053 s |
| Total time | 29.752 s |
| Website HTTP requests | 1 |
| Rate-limit waits | 0 |
| Published artifact / fresh artifact execution | None |

All five provider responses reported usage. Zero execution model calls, manual corrections or extra paid retries. Frozen files remained unchanged, and current source matches the frozen source. This shorter failed run is not an end-to-end speed improvement.

### Exact failure

The task job's provider request is byte-for-byte identical to the previous demo. Previously it returned `requiresNavigation:true`; now it returned false. The homepage capture hash is also identical. The source job received:

```json
{"format":"html","component":"initial","task":{"requiresNavigation":false,"resultFlow":null},"resultDataSchema":null,"canFollow":true,"canFetch":false,"sourceIndices":[{"index":0,"format":"html"}]}
```

It proposed `selector:"a[href='/trainings']"`, `links:null`, with URL/label fields. That selects the two navigation anchors as result records without visiting the timetable. The generated schema/mapping admitted those link objects, but the final reviewer correctly rejected them as missing actual timetable entries.

The unchanged task prompt defines `requiresNavigation` as explicit instruction wording, not whether the content actually requires navigation. The source context simultaneously supplies that false flag and the true caller permission. The earlier task answer inferred navigation need despite the prompt's narrow definition. This is inconsistent task signaling; the observed failure does not establish that the new field capability caused the changed author behavior. The flag does not mechanically prevent HTML following here (`canFollow` was true). It also serves JSON/XML reference routing, so deleting it globally is not justified by this one HTML failure.

The reader capability is mechanically verified and independently reviewed. Automatic timetable extraction and artifact execution remain unproved by this run. Clarify the source job's navigation responsibility and the meaning/visibility of the earlier task flag before another end-to-end retry; do not add another repair layer or silently bypass this failure with a manually supplied timetable URL.
