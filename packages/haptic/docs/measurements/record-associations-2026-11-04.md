# Record-association experiment — 4 November 2026

## Decision

**Both proposed prompt changes were rejected and reverted.** Production `src/discovery/discovery.json` is byte-for-byte identical to its pre-experiment copy. No production TypeScript, engine, grammar, model settings, dependencies, budgets or permissions changed. Experimental runners, handwritten capability proofs, provider requests/responses, original captures and generated artifacts remain separate evidence under `data/runs/record-associations-2026-11-04/`.

One better generated timetable artifact is retained as a useful specific result, not evidence that generic discovery became more dependable. Its exact location is `data/runs/record-associations-2026-11-04/cases/timetable/artifact.json`. The later source-only artifact is a failed improvement attempt and must not replace it merely because it was generated later.

## Hypothesis and capability checks

The approved slice targeted record boundaries and associations. Source guidance would select individual requested items and use the existing nearest-parent field scope for shared context. Output guidance would consolidate source-supported duplicate identities before applying a requested collection limit. Fields and identity were task-derived; no source-site names, selectors, business fields or fixture values entered production policy.

Eleven offline checks on original saved Anima/Spiegel pages establish that existing primitives can express the desired behavior: five timetable variants preserve per-item notes/shared context; six news variants consolidate duplicate occurrences before limiting. The manual timetable rule returns19 classes/6 notes and20 after insertion. The manual news program returns10 distinct articles/9 descriptions, compared with5 descriptions in the previous learned mapping. A corrected later-duplicate variant removes descriptions from all earlier occurrences and verifies that the appended richer occurrence supplies the value. These handwritten rules/programs are capability tests only and were never model inputs. Ten source records do not certify editorial top-ten order; the independent primary-content oracle starts with a different article than the all-container manual proof.

## Focused real-model tests

All four original requests and their original HTTP captures were frozen before new provider calls. Discovery used the actual public library, fresh120b responses, the published Prism mapping agent and original caller schemas when supplied. Baseline artifacts and expected answers were never given to discovery. Website acquisition was explicitly replaced with the frozen actual captures; no fresh-web discovery claim is made. Each published artifact was independently executed with a mechanical-only registry; model calls during execution were forbidden. Models/settings remained120b/high reasoning/temperature1/top-p1/emit. There were no manual candidate corrections.

| Configuration / request          | Actual outcome                                                                       | Requests | Reported input / output tokens | Discovery time |
| -------------------------------- | ------------------------------------------------------------------------------------ | -------: | -----------------------------: | -------------: |
| Both additions — Anima           | 19 individual classes; all6 notes correctly attached                                 |       10 |                131,178 /33,836 |        88.881s |
| Both additions — Spiegel         | 10 distinct URLs,5 descriptions; headline text includes nearby timestamps/live badge |        7 |                411,465 /19,209 |        71.669s |
| Both additions — Django control  | 10/10 requested headline/intro pairs                                                 |        7 |                 70,759 /14,980 |        42.889s |
| Both additions — pricing control | Both requested prices; distinct same-page items preserved                            |        5 |                 28,182 /10,732 |        27.844s |
| Source addition alone — Anima    | 19 classes plus2 footer contacts; notes field omitted entirely                       |        9 |                108,925 /18,466 |        50.577s |

Totals:38 physical provider requests, all38 reporting usage,750,509 input/97,223 output tokens,281.860 seconds summed discovery time, zero rate-limit responses/waits. These five related runs are not a broad accuracy score or a statistical causal comparison. The controls belong to the two-addition configuration; no source-only control batch followed.

The initial Anima outcome improves on the earlier six day groups with ambiguous note ownership. However, its generated mapping filters using only six observed weekday names. It passes moved-note, added-record and empty-class checks, but a group-label change drops four classes. A separate supplemental probe moves the same four classes to valid `SUNDAY`; the artifact again returns15 rather than19. The Sunday probe was created after observing the literal filter, was never model input and did not trigger further prompt tuning.

The new Spiegel mapping again slices the first ten native records before consolidation. The output clarification showed no benefit. Its five nonempty descriptions remain source-supported, while earlier entries miss available descriptions and include extraneous headline labels. Changed descriptions, added records, later richer duplicates and reordering do not establish complete requested data. Empty article removal returns an empty array. The actual result does not match the independent primary-content oracle's first-ten ordering; count and source support alone do not settle the request's ranking intent.

After independent review, only the unhelpful output addition was removed and one final Anima discovery tested the source guidance alone. That attempt still selected individual records but omitted notes and admitted footer contacts. Removing all classes leaves the two contacts, so its empty-source behavior also fails the task. It does not establish that removing output wording caused the source regression: the source author never receives the output prompt. Both source jobs received the same full prepared timetable HTML hash; the failed job's later scoped views also contained the cancellation, substitute-teacher and course notes. Preparation did not erase the relevant evidence.

## Retained useful artifact and fresh live execution

The initial successful Anima artifact was run unchanged against the live website after these experiments. It returned19/19 correct class records and all6 notes with exact class ownership, independently checked against the freshly captured source. Execution took371.384ms, plus184.818ms preparation, with two HTTP requests and zero model calls. This is fresh execution of a saved generated artifact, not fresh discovery. The weekday-filter reuse limitation remains.

## Review, rollback and verification

The targeted independent reviewer first cleared generic JSON ownership and model-input isolation, then challenged the capability proof's ordering and duplicate-variant limitations. Those limits were recorded and the duplicate test corrected. After actual model results and the failed source-only repeat, the reviewer recommended reverting both additions rather than preserving unproven prose or starting further prompt trials. The review did not regrade the whole product.

Both experimental configurations passed the complete offline suite. After rollback, strict TypeScript, all56 offline modules and all33 benchmark checks pass again. The HTTP-only PDF regression passes. Documentation checks cover42 declared documents and69 relative links. Engine/native code and published Prism ownership are unchanged. No new controller, adapter, schema-repair mechanism or runtime AI was introduced.

The evidence supports a narrower conclusion: existing grammar can represent correct associations; these prompt additions did not demonstrate dependable automatic authoring. The better individual artifact is useful. The generic production improvement is not adopted.
