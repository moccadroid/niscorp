# Provider output rejection recovery

The saved Spiegel request fails before acquisition. Groq returns HTTP 200, streams reasoning, then emits `output_parse_failed` with embedded status 400. Signal preserves it as a structured provider exception. Its shipped failed-generation strategy recognises different codes. Cortex stops exceptions immediately; its failed-output path already retains history and retries within the configured step/time ceiling.

## Ownership and chosen correction

Use the existing failed-output protocol at the shared discovery model boundary. JSON declares recognised provider code/status pairs and their correction evidence. A small ordinary Prism projection selects that evidence from structured error facts. TypeScript extracts protocol facts and translates a match to a failed `StepResult`; Cortex alone owns the next model step. No second loop, discovery restart, new budget, wait or dependency patch is needed. Every discovery job uses the same boundary, including the actual published Prism agent and final reviewer.

The matched result has empty content/tool calls, unavailable usage and a failed outcome. Rejected reasoning/`failed_generation` remains diagnostic evidence only, never an answer or instruction. Cortex's existing provider-rejection path resets partial output and asks for a fresh response in the same conversation. Each attempt consumes the existing job step cap and elapsed allowance, then the owning JSON budget is charged once for the whole run. Output rejection exhaustion remains a visible failure. Unknown errors, authentication, ordinary invalid requests, resource controls and cancellation retain their existing paths; rate-limit waiting/retries remain transport-owned. The default rule only matches `output_parse_failed` with status 400. Empty rules disable adaptation.

This avoids two worse ownership choices: repeating only task declaration would leave all other jobs broken, while a native retry loop would duplicate Cortex history, stops and budget accounting. Recovering JSON fragments from rejected reasoning could accept an answer the provider never successfully emitted and is explicitly excluded.

## Falsifiable checks

- Replay the exact saved SSE failure through real Signal/SDK/Cortex, followed by a successful response: two calls, same request context, correction visible, one charged Cortex run.
- Always reject: stop at the existing step ceiling; preserve errors and mark usage unavailable. A one-step or expired allowance permits no second call.
- Reject after partial text/tool deltas: discard them, execute no stale call, accept only a later complete validated answer.
- Authentication, unknown/misclassified codes/statuses, cancellation and input/engine limits do not enter output recovery. Existing reactive HTTP429 behavior stays unchanged.
- Exercise task, source, schema, published Prism and reviewer production operations; verify full discovery retains caller permissions and charges all model steps/time. Finished artifacts contain no model operation.
- Keep saved provider evidence and test machinery separate from production. Full offline checks and focused review precede one fresh unchanged Spiegel discovery and AI-free execution. A clean live call alone cannot prove recovery was exercised.
