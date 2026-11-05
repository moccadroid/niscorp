# Focused saved-candidate model evaluation — 30 October 2026

> Tooling retirement, 2026-11-01: commands and runner paths below describe this historical experiment. The one-off saved-authoring/navigation/CAPTCHA research drivers were removed during handoff cleanup; original captures, failed results and archived tool snapshots remain in ignored evidence. Current offline contracts are tested through the maintained `tests` suite. Optional codec use is documented in the current image-choice contract; historical Sharp instructions are not current setup instructions.

The new review rejected the unchanged broad candidate containing Comic Con. Neither control regressed. None of the three saved Meetup failures repaired successfully.

## Scope and method

Evidence: `data/runs/author-repair-models-2026-10-30T09-49-57-142Z`.
Runner: `scripts/check-saved-authoring-models.mjs`.
Cases: the same six entries in `benchmarks/author-repair-cases.json` as the preceding offline check.

The runner executes the existing production `attempt` JSON flow, with the unchanged saved provider answer supplied as its initial author response. Cortex validates that answer through the current library and feeds actual new diagnostics to fresh 120b repair calls. The configured three-step limit includes the saved answer, leaving two fresh repair opportunities for each Meetup case. No hand-written correction or additional retry budget was supplied.

For Comic Con and the two controls, the unchanged candidate passes the normal mechanical trial, followed by a fresh verdict-only review through the current JSON policy. All trial acquisition uses the unchanged saved HTTP captures; uncaptured destinations fail. These are saved-source model evaluations, not fresh web discoveries or a full search run. Only reviewed stage artifacts are replayed. No wider batch was run.

Settings: Groq `openai/gpt-oss-120b`, high reasoning, temperature 1, top-p 1, `emit`; the current default discovery profile is captured in `frozen.json`. Source hashes were verified unchanged after the batch. Engine and library source were untouched.

## Results

| Saved case | Outcome | Fresh requests | Input tokens | Output tokens | Wall seconds, including pacing |
|---|---|---:|---:|---:|---:|
| Meetup failure 1 | No repair; no usable artifact | 2 | 93,755 | 9,672 | 87.46 |
| Meetup failure 2 | No repair; no usable artifact | 2 | 93,413 | 7,102 | 71.11 |
| Meetup failure 3 | No repair; no usable artifact | 2 | 94,411 | 6,887 | 68.12 |
| Broad candidate containing Comic Con | Rejected | 1 | 11,777 | 1,190 | 3.73 |
| AIEventlist control | Accepted; original 3 records unchanged | 1 | 51,285 | 1,069 | 51.12 |
| AI What's On control | Accepted; original 1 record unchanged | 1 | 16,685 | 1,012 | 3.66 |
| **Total** | **3/6 desired case outcomes** | **9** | **361,326** | **26,932** | **285.82 whole batch** |

Meetup repair success: **0/3**. Review verdicts on the negative candidate and two positive controls: **3/3 expected verdicts**. These are distinct measurements, not a general discovery accuracy score. The three Meetup cases share one source page and represent different saved bad candidates.

All nine fresh requests returned HTTP 200 and reported usage. Six historical seeded answers are excluded from new request and usage totals. Output tokens include reasoning. No Jev calls occurred. Pacing waits totalled **201.700 seconds**, including initial quota cooldown; fresh provider/network time totalled **74.646 seconds**. The remaining **9.477 seconds** covers local preparation, parsing, trials, evidence writes and replay. No quota errors occurred.

## What failed and what improved

In Meetup cases 1 and 2, the model repaired enough of the heading/list relationship to find anchors, then failed on a required title absent from the first selected image anchor. Case 3 retained the same record-boundary error. Subsequent repairs continued to select anchors rather than complete containing records, despite the actual parsed element and parent outline in the feedback. All six fresh repairs ended with `HTML_FIELD_MATCHES` for the required `title` field, selector `h3`, actual count zero in record 0. All three runs exhausted their configured step limit. No candidate reached semantic review, and no Meetup artifact qualified.

The Comic Con candidate's 15 original records remained unchanged. The fresh review rejected the whole stage because it returned conferences and workshops as well as meetups. Its reasoning named Moving Forward Conference and ECR Tag as counterexamples; it did **not** individually name or classify Comic Con. Thus the candidate containing Comic Con is now blocked, but this test does not establish individual Comic Con recognition or a corrected replacement rule.

Both positive controls retained identical native extraction output and passed fresh review. Their two reviewed stage artifacts executed against the saved captures without AI. No changed-source, cross-page or fresh-HTTP reuse was tested.

The demonstrated improvement is rejection of the overly broad candidate without rejecting these controls. Better structural diagnostics alone did not produce a successful Meetup repair. Do not claim the Meetup issue is fixed or infer a revised search/full-suite score.

## Evidence and checks

The evidence directory contains exact inputs, frozen sources/workflows/profile, six original seeded responses, nine raw fresh provider bodies saved before parsing, exact provider requests, Cortex retry events, per-case outcomes and two AI-free replay outputs. All failed attempts remain retained.

`pnpm typecheck` and `pnpm check` passed before the frozen paid run; normal checks remained offline. Log: `data/runs/author-repair-models-checks-2026-10-30.txt`. The focused driver was the only added executable file. No production policy or engine change was made during this evaluation.
