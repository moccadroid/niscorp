# Local discovery dataflow — 4 November 2026

This refactor addresses the same-standard reviewers' concrete maintainability finding: shared helpers and output jobs forwarded the whole discovery state. The existing fixed JSON pipeline, engine grammar, prompts, model settings and public API remain intact. No controller, dispatcher, database, new DSL or paid model experiment was added.

## Implemented boundaries

| Consumer           | Before                                          | Current responsibility                                                                                                 |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Accounting         | Whole state, budget owner and full model result | One allowance plus reported step/time usage → one allowance                                                            |
| History            | Whole state forwarded and returned              | Explicit histories/feedback/round inputs → history values                                                              |
| Schema author      | Whole state with unrelated captures/traversal   | Named authoring inputs → schema, allowance, history and failure facts                                                  |
| Mapping author     | Whole state replacement after every retry       | Native extracted data and explicit trial dependencies → mapping, artifact, trial, allowance, history and failure facts |
| Reviewer           | Whole-state review wrapper                      | Existing explicit reviewer input, invoked directly by root                                                             |
| Captured trial     | Unused blueprint argument required              | Artifact, captures and URL only                                                                                        |
| Output binder      | Complete blueprint                              | The shaped flow it actually uses                                                                                       |
| Fresh verification | Whole state forwarded                           | Artifact/URL → fresh trial, publication flag and reason                                                                |

Assembly returns only owned extraction/evidence/acquisition results. Output intermediates leave root initial/reset state. One explicit source-limitation fact replaces the old source-trial fallback; the limited/exhausted counterexample verifies the original coalescing behavior. Initial root fields fall from 32 to 27; this count is descriptive, not a quality threshold.

Final job schemas distinguish success from failure. A schema job cannot report success with a null schema. A mapping job cannot report success without an artifact and completed trial. Rejected intermediate observations remain repairable; literal-null Prism programs remain valid. The root preserves matching last-working artifacts/schema/trial/verdict without restoring old spending/history.

## Evidence

The frozen source/tests are under `data/runs/local-discovery-dataflow-2026-11-04/before`.

- **451/451** actual helper comparisons match, including absent/partial/null usage, overspending, scoped history, repeated repair feedback and failed/skipped proposals.
- **8/8** complete controlled pipeline comparisons match exactly: model-bound requests, public results, artifacts, budgets, HTTP effects and AI-free replay. They cover supplied/generated schemas, schema/mapping repair, exhausted allowance, rejected correction, limited acquisition and literal-null output.
- The narrowed binder produces a byte-identical **113,660-byte artifact**. Current, changed, empty and corrupt-capture cases agree.
- Ten focused local-job groups include rejection of unrelated outer fields before effects and malformed final producer success before consumption.
- Engine, connectors, readers and both model/default profiles are byte-identical to this slice's baseline: 31 files. Root prompt/data equality holds.

These are preservation/ownership checks using controlled replies, not fresh discovery accuracy or new semantic correctness evidence.

## Performance

The composed program changes **803,875 → 802,996 bytes**. Alternating preparation samples are **977/867/715 ms before** and **926/901/675 ms after**. Three descriptive samples establish no speed improvement. The engine is unchanged. This refactor's benefit is independent job ownership and narrower dependencies; it does not claim dramatic size or latency reduction.

## Verification and review

The complete offline suite passes 52 modules plus 15 benchmark-support tests. Strict typecheck passes. The live HTTP-only PDF regression passes. Final packed-consumer verification is recorded separately in the run evidence.

One earlier focused run ended with an existing `DEADLINE` control after sixteen successful group messages. Its actual start/elapsed time was not recorded, so the exact triggering circumstance is unresolved; file creation time is not evidence of run start. The unchanged-limit repeat passed all 32 source-grounded groups in **53.843 seconds**, and the complete suite passes. No limits or engine controls were widened to obtain a pass. The failed log remains preserved.

Two retained reviewers and an independent Nisc reviewer checked the implementation. The Nisc reviewer who implemented the output changes did not independently certify that work. The original category meanings remain fixed. Code-quality discovery JSON improves **7 → 7.5**, Nisc discovery simplicity **7 → 7.5**, and discovery architecture **7.5 → 8**. Their overall scores remain **7.5/8/7.5**; unattended readiness remains **4.5**. They found and verified fixes for the final-producer contract gap during this checkpoint.

Broader source/traversal state and root repair composition remain cognitive costs. The recorded wrong/missing results and false semantic acceptance remain unresolved product limitations. The latest semantic evidence is unchanged: 25 complete, one partial, two unusable and six no-artifact results across 34 attempts. This slice does not meet the whole-library 9/10 target or justify another grading scope change.
