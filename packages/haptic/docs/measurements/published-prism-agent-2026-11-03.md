# Published Prism agent adoption — 3 November 2026

The user required deletion of Haptic's local Prism agent and use of the published package agent. This change replaces the output and native JSON-reference mapping jobs with `mappingAgent` from `@niscorp/prism/agent`.

## Ownership

- Deleted `createPrismAuthorOperation`, its local documentation schema, and its `getProfileJsonSchema`/operator-profile assembly from `source-author.ts`.
- Added a thin `prism-mapping.ts` operation that imports the actual published definition. It accepts no instruction, schema or documentation override.
- The shared model runner uses the published ID, instructions, output schema and documentation unchanged. Cortex's configuration API binds the existing JSON-owned output strategy and stop conditions. Transport settings, cancellation, provider-output observation and result handling remain shared.
- Both JSON mapping call sites supply Haptic's task requirements as a user message. Their local definition-level instruction/documentation inputs are deleted. Actual `{input:nativeValue}` execution examples, the distinct result schema, history and mechanical feedback remain unchanged.
- JSON retains sequencing, permissions, mechanical trials, repair and publication. No agent prompts another agent, and finished execution remains mechanical.

The installed package's mapping agent is `prism.mapping`. It accepts message input, so Haptic can retain exact execution roots and clearly labeled result JSON Schema instead of mislabeling a schema document as the package's illustrative `targetShape` value.

## Verification

`pnpm typecheck` and the full `pnpm check` pass. The updated local-provider test independently proves:

1. Exact published system instructions and schema documentation are sent unchanged, with one schema document.
2. Cortex events identify `prism.mapping` for both mapping jobs.
3. An invalid Prism answer receives Cortex correction and a valid answer completes.
4. Repeated invalid answers stop at the configured two-step test allowance, rather than the package's default allowance.
5. Retired local instruction/documentation overrides fail before a provider request.

Grounded discovery/acquisition, shared program-context, final-review boundary and search integration checks pass. A stale search test mock originally required a local `instructions` field for every model job; its shared mock input was corrected, and it now asserts mapping requirements are user context with no definition overrides. The initial restricted local-server invocation could not connect; the permitted local-provider invocation passes without a code workaround. Failed logs remain preserved.

The required live HTTP-only PDF regression passes with zero model calls. Engine files, package manifest and lock match the pre-change hashes. No dependencies or sibling workspace changed.

An independent focused review finds no material defect and grades this scoped integration 9/10. Its suggested agent-identity and exhausted-budget controls were added and passed. This is engineering evidence, not a fresh accuracy measurement.

Evidence is under `data/runs/published-prism-agent-2026-11-03/`.

## Explicitly unchanged and unresolved

No paid models were run. The earlier SQLite failure belongs to the deleted local agent; this change does not establish that the published agent solves that task.

The paired XML source-reference job still emits `{xml,mapping}`. It was not silently replaced with the retired XML handoff. Its separation into source extraction and published mapping requires a concrete JSON-owned handoff; do not claim this change removes that exception.

HTML inline/inspection/request limits remain unchanged in this correction. The source author can still be forced to propose after observations which revealed no useful HTML. Guardian and Spiegel's review inputs were blocked locally; the reviewer did not emit those large bodies. They were full prepared source evidence assembled by Haptic. Spiegel's artifact executed and returned usable headline/link pairs, with missing descriptions and changed selection. It must be described as partial, not unavailable or semantically rejected.
