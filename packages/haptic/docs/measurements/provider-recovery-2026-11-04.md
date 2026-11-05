# Bounded provider recovery — 4 November 2026

## Problem and ownership

The frozen Spiegel attempt exhausted Groq's ordinary HTTP429 retries before discovery could finish. That is an infrastructure-blocked attempt, not evidence that Spiegel cannot be extracted. The original run remains unchanged.

The discovery profile now declares `modelTransport.openaiCompatible.maxRetries:5` and `rateLimit:{statuses:[429],fallbackWaitMs:1000,code,message}`. Signal's public SDK injection configures the existing OpenAI SDK as the only HTTP retry loop. The transport retains the original request and delays its next transmission only after a real configured rate-limit response, using original `retry-after-ms`, `Retry-After` seconds/date, or the configured fallback. The SDK's private retry sleep is not cancellable; internal retry headers are adapted to zero while a cancellable next-dispatch gate honours the original delay. HTTP audit captures retain the original response headers.

No prompt, model, sampling setting, author allowance, database, engine, persistence or discovery planner changed. A quota retry reuses its owned page and conversation, not a new discovery pass. The original model allowance and caller/global cancellation still apply. Cooldown is shared within one factory client/model, not separate factories, processes or other organization jobs.

An owned model deadline ends that job rather than masquerading as caller cancellation. Known current quota facts produce a structured provider block; a later non-quota connection stall produces `MODEL_TIME_LIMIT`, not stale quota attribution. Caller cancellation and the whole-run deadline remain terminal. JSON decides publication and repair.

Public `status:blocked` with a null artifact exposes `{kind,code,message,status,retryAfterMs}`. If quota blocks review or repair after a working artifact exists, JSON retains that artifact, matching schema/verdict and fresh mechanical verification, returning `ready` plus `blocked` metadata. There is no durable resume token or unbounded wait. Benchmark qualification excludes a no-artifact provider block from extraction-quality scoring, but still grades any working artifact's actual data.

## Offline verification

Strict TypeScript, all 56 offline modules and all 33 benchmark checks pass. New tests cover six physical transmissions in the same Cortex step, exact request/history preservation, page reuse, original millisecond/date/fallback delays, client/model-scoped reactive cooldown, exhausted bounds, source/schema/review/repair blocking, working-artifact retention, cancellation during waits and stale-error prevention. The existing provider-output recovery tests still pass. The required HTTP-only RFC/PDF regression passes without model credentials.

The targeted independent reviewer cleared the transport and JSON ownership, timeout/cancellation distinction and artifact-retention paths. This is not a whole-product regrade or evidence of improved semantic accuracy.

The isolated package-consumer check also passes: four AI-free executions of two existing controls, core imports with optional model/codec peers absent, explicit discovery/search imports without provider calls, and explicit optional codec import. All eleven compiled engine runtime/profile files match the pre-change baseline. Documentation checks cover 41 declared documents and 68 relative links. Package identity and dependencies remain unchanged.

## Fresh original Spiegel request

Input was unchanged:

```json
{
  "url": "https://www.spiegel.de",
  "instruction": "get me the headlines, abstract/description, and article links for the top 10 articles from spiegel.de"
}
```

The frozen runner asserted that the complete profile, excluding the newly added `modelTransport`, matched the original run. It used the actual public library pipeline, live HTTP only and no manual corrections. Returned execution used only mechanical operations; any attempted model request would fail the run.

| Measurement                                             |                 Result |
| ------------------------------------------------------- | ---------------------: |
| Published artifact                                      |                    Yes |
| Result records / distinct article links                 |                10 / 10 |
| Returned descriptions                                   |                      5 |
| Available descriptions omitted                          |                      4 |
| Remaining null description absent from matching teasers |                      1 |
| Provider transmissions / reported-usage responses       |                11 / 11 |
| Reported input / output tokens                          |       450,773 / 24,196 |
| Discovery / workflow preparation                        |     85.401 s / 1.060 s |
| Independent AI-free execution / artifact preparation    | 215.170 ms / 96.158 ms |
| Total harness time                                      |               86.778 s |
| Actual rate-limit responses / retry waits               |                  0 / 0 |
| Logical website acquisitions                            |                      3 |
| Model calls during artifact execution                   |                      0 |

The three website acquisitions are initial discovery, fresh final verification and independent execution. There are no link visits or quota-driven website refetches. This run did not encounter live quota and therefore does not by itself demonstrate live quota recovery; that path is covered by controlled SDK and complete-pipeline tests.

An independent offline audit of both fresh verification and execution captures found all ten headline/link associations and all five descriptions source-supported. The result follows the first ten matching article containers in document order, not a certified viewport/editorial ranking. Four null descriptions have corresponding descriptions in other cards for the same URL elsewhere on the page. The learned Prism program takes the first ten extracted records, so later richer occurrences never enter the result. The reviewer nevertheless accepted the result. This is **useful partial extraction**, not complete fulfilment. No further prompt, selection, mapping or reviewer change was made in this slice.

Raw evidence is in `data/runs/provider-recovery-2026-11-04/`: offline logs, `engine-comparison.json`, HTTP-only PDF log, frozen live code, exact provider requests/responses, HTTP captures, generated artifact, independent execution, summary and `source-audit.json`. The source audit is evaluator-only and was never fed to discovery or used to correct the artifact. All original frozen batch outcomes remain preserved.
