# Shared provider-output recovery — 2026-11-03

## Result

The exact saved Spiegel provider rejection now receives a fresh answer through the existing Cortex run. Its first provider error no longer ends the job immediately. This is demonstrated through the actual SDK/Signal/Cortex path with the original recorded SSE response, not a mocked discovery decision.

The focused live run publishes a mechanically working but semantically partial artifact. It does not encounter `output_parse_failed`, so it is not the recovery proof. Independent output checks remain separate from mechanical availability and reviewer acceptance.

## Why this boundary

Signal's shipped error strategy recognises other rejection codes. Groq's saved HTTP200 stream ends with `output_parse_failed` and embedded status400; Signal throws a structured provider exception and Cortex stops exceptions before output correction. The remaining author allowance was therefore unused.

The correction translates the recognised rejection to Signal's existing failed-output outcome. Cortex keeps the same conversation and owns the only retry loop. No task-only retry, new controller, discovery restart, custom Prism agent, dependency patch or engine change was added. See `docs/plans/provider-output-recovery.md` for the ownership contract and rejected alternatives.

The profile now requires `outputRejections`, a small array of `{code,status,evidence}` rules. The shipped rule recognises only `output_parse_failed`/400; `[]` disables adaptation. `output-rejection.json` uses ordinary Prism to select the evidence. Native code decodes provider facts and translates a match; it contains no website or retry-count policy.

The translated result has empty answer content and tool calls, failed outcome, and unreported usage. Rejected generation is diagnostic evidence only. Cortex resets partial output, adds its standard correction using the configured evidence and requests another answer within the same step/time ceiling. All attempts count toward the existing JSON owner pool. Cancellation and unknown/authentication errors retain their paths; HTTP429 retries and waits remain transport-owned.

Seven discovery production files changed. The engine, readers, dependencies, source prompts, model settings and semantic-repair policy are unchanged. Finished artifacts remain AI-free.

## Offline checks

Thirteen focused groups pass:

- A successful initial call sends once.
- The exact saved SSE rejection followed by a valid response takes two Cortex steps, preserves original context and receives correction evidence. Rejected reasoning is absent from the next prompt. Unknown usage remains explicitly unreported.
- Repeated rejection stops at the existing three-step cap. One remaining step permits one call only.
- An empty JSON rule list disables adaptation.
- Unknown code, authentication and mismatched status stay terminal; message text alone never selects policy.
- Partial answer/tool deltas preceding rejection cannot become an accepted answer or execute a stale call.
- Cancellation and elapsed deadlines prevent another call without renewing an allowance.
- The full discovery integration rejects once and succeeds in each of task/source/schema/published-Prism/review. Eight author steps and two review steps are charged to their original pools. The resulting artifact executes through mechanical-only operations without another model request.

The exact SSE response is committed as a test fixture under `tests/fixtures/provider-output-recovery/`; normal checks do not depend on archived run directories. All HTTP/model responses in those groups are offline fixtures. They establish recovery contracts, not model discovery accuracy.

Type checking and full `pnpm check` pass: 45 TypeScript modules and 15 benchmark-support tests. The required HTTP-only PDF regression passes with models unavailable. A focused independent reviewer independently passes all thirteen groups, verifies unchanged reactive HTTP429 behavior and outer authentication-status precedence, and finds no material issues: scoped engineering grade9/10. The requested custom-profile documentation clarification is included.

## One unchanged live Spiegel request

Input remains the original URL and instruction requesting the top ten headlines, descriptions and links. Current production source/build/profile are frozen before effects; no old answers, selectors, saved-page substitutions or manual corrections are supplied.

| Measurement                                            |                                Result |
| ------------------------------------------------------ | ------------------------------------: |
| Actual provider requests                               |                                    16 |
| Responses reporting usage                              | 14; remaining2 are HTTP429 rejections |
| Reported input tokens                                  |                                597159 |
| Reported output tokens                                 |                                 33295 |
| Discovery and independent live execution               |                              129.016s |
| Actual HTTP429 wait time                               |                               17.027s |
| Independent AI-free artifact execution, including HTTP |                             373.641ms |
| Artifact preparation                                   |                             146.738ms |
| Execution model requests                               |                                     0 |
| New output-rejection adaptations exercised live        |                                     0 |

The first semantic review rejects the candidate, triggering the existing one bounded full-pipeline correction. That repeat and two actual quota retries contribute to the cost; no new recovery loop ran in this live request.

Actual final output has five proper headline/link pairs, three source-supported descriptions mislabelled as headlines and two blank rows. The five valid headline pairs lack descriptions. The final reviewer incorrectly accepts the result. These are preserved raw results, not silently filtered or regraded as complete.

As a separate offline diagnostic, the older unchanged Spiegel artifact executes against the exact fresh execution capture with no HTTP/models. It produces eight proper headline/link pairs and three descriptions, with two incomplete rows. That isolates a fresh-authoring quality loss on the same source; page churn cannot explain the whole difference. Neither result is a clean top-ten answer. No prompt patch, selector workaround or additional paid batch followed.

## Evidence

`data/runs/provider-output-recovery-2026-11-03/` contains the prior-source snapshot, original failed exchange, frozen new source/build, full/focused/type/PDF verification, reviewer result, exact live provider/HTTP exchanges, emitted artifact/schema/data and the clearly separated identical-source comparison. All original artifacts and failed evidence remain unchanged. `verification.json` records ownership and unchanged-source checks; `report.json` keeps recovery evidence separate from live output quality.
