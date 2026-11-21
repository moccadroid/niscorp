# Review A vs Review B: agreement, checked against the code

Review A read e130a625 (2026-10-28); Review B read c5b6cc4f (2026-11-12). Code checked at c5b6cc4f (`worktrees/review-base`), old code via `git show e130a625:`.

## Counting rules

- A **pair** is one A finding and one B finding with the same root cause. **Full** = 1, **partial** (same function/lines, different claim) = 0.5 in the numerator and 1 in the denominator.
- Agreement = (full + 0.5 x partial) / (pairs + A-only + B-only).
- Bundled findings (one row listing several defects) pair **full** when at least half the items of the shorter bundle are the same defect, else partial. A bundle may pair with two findings on the other side when it contains both claims (NOVA-6, LOOM-9, NISC-1 on A's side; signal B2 on B's side). Each pair is counted once.
- Only numbered findings count. Remarks in B's "Tests:", "Maintainability:" or "Noted as good" lines are noted but not counted.
- S1+S2 numbers: a pair counts if either side rated it S1 or S2. A-only/B-only count if that side rated it S1/S2.
- Left out of the denominators: **changed between commits** (A finding gone at c5b6cc4f) and **new code** (B finding in code that did not exist at e130a625).
- A's line numbers for strata (`node/index.ts:311,349,362`) do not exist in that file at either commit (189 lines). The claims were checked by content.

## Summary per package

| Package | Grade A | Grade B | Steps | Full | Partial | A-only | B-only | Agreement (all) | S1+S2: pairs (f/p) / A-only / B-only | Agreement (S1+S2) | Left out |
|---|---|---|---|---|---|---|---|---|---|---|---|
| moss | B+ | B | 1 | 1 | 1 | 2 | 6 | 1.5/10 = 0.15 | 0/1 / 1 / 3 | 0.5/5 = 0.10 | |
| charter | B | B | 0 | 2 | 1 | 0 | 2 | 2.5/5 = 0.50 | 2/0 / 0 / 0 | 2/2 = 1.00 | |
| nova | B- | B | 1 | 1 | 2 | 6 | 8 | 2/17 = 0.12 | 1/0 / 0 / 1 | 1/2 = 0.50 | |
| vex | B- | B- | 0 | 5 | 1 | 8 | 8 | 5.5/22 = 0.25 | 2/1 / 5 / 3 | 2.5/11 = 0.23 | |
| prism | B | B+ | 1 | 6 | 1 | 2 | 4 | 6.5/13 = 0.50 | 2/0 / 0 / 0 | 2/2 = 1.00 | |
| loom | C+ | B- | 1 | 7 | 0 | 4 | 2 | 7/13 = 0.54 | 4/0 / 2 / 0 | 4/6 = 0.67 | |
| signal | B- | B- | 0 | 3 | 1 | 2 | 6 | 3.5/12 = 0.29 | 1/1 / 0 / 1 | 1.5/3 = 0.50 | |
| cortex | B | C+ | 2 | 2 | 1 | 3 | 6 | 2.5/12 = 0.21 | 1/0 / 1 / 4 | 1/6 = 0.17 | |
| solid | C+ | C | 1 | 3 | 0 | 1 | 4 | 3/8 = 0.38 | 3/0 / 1 / 0 | 3/4 = 0.75 | |
| tide | C+ | C+ | 0 | 4 | 0 | 4 | 5 | 4/13 = 0.31 | 3/0 / 2 / 3 | 3/8 = 0.38 | TIDE-1 (S2, changed) |
| strata | B | B | 0 | 2 | 0 | 3 | 3 | 2/8 = 0.25 | 1/0 / 2 / 0 | 1/3 = 0.33 | |
| cli | B | C+ | 2 | 3 | 0 | 2 | 4 | 3/9 = 0.33 | 2/0 / 0 / 2 | 2/4 = 0.50 | B6 (S3, new code) |
| create-nisc | B- | B+ | 2 | 3 | 0 | 1 | 3 | 3/7 = 0.43 | none | n/a | B1 (S3, new code) |
| nisc (docs) | C+ | B- | 1 | 3 | 1 | 1 | 2 | 3.5/7 = 0.50 | 2/0 / 0 / 0 | 2/2 = 1.00 | NISC-2, NISC-4 (S3, changed) |
| **Total** | | | mean 0.86 | **45** | **9** | **39** | **63** | **49.5/156 = 0.32** | **24/3 / 14 / 17** | **25.5/58 = 0.44** | 3 changed, 2 new code |

Totals check: A has 93 findings = 51 in pairs + 39 A-only + 3 changed. B has 118 = 53 in pairs + 63 B-only + 2 new code.

Grades: 5 equal, 6 one step apart, 3 two steps apart (cortex, cli, create-nisc). A graded higher in 4 packages (moss, cortex, solid, cli), B in 5 (nova, prism, loom, create-nisc, nisc): no consistent bias.

Severity on the 45 full pairs: 30 same, 15 different; in 13 of the 15 A rated higher (VEX-6 S1 vs S3; PRISM-1, PRISM-3 S2 vs S3; PRISM-6 S3 vs C; SIGNAL-1, SOLID-2, SOLID-4, TIDE-6, CLI-4 S2 vs S3; CREATE-3 S3 vs C; NISC-1 x2 S2 vs C; NISC-5 S3 vs C). B rated higher only for NOVA-3/B2 and LOOM-9/B1 (S3 vs S2).

## Per package: findings, pairs, verdicts

Verdict key for unmatched findings: **real** = present at c5b6cc4f; **gone** = absent at c5b6cc4f; **new code** = code not at e130a625; **not real** = claim wrong. S1/S2 checked by reading cited code (and a script where noted); S3/C classified from reading only.

### moss

| Pair | Type | Note |
|---|---|---|
| MOSS-3 (C) - B7 (C) | full | DESIGN says moss updates/deletes no artifact rows; aging.ts deletes, saves touch updates |
| MOSS-1 (S3) - B2 (S2) | partial | Same lines (`integrations/forward.ts` request building gives 502), different trigger: HEAD gets a body vs. hop-by-hop headers copied |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| MOSS-2 revalidation stops forever on a hung verifier | S2 | real | `socket/revalidation.ts:59-70`: `passing` guard; `config.session()` awaited at :43 with no timeout |
| MOSS-4 aging timer not unref'd | C | real | `data/aging.ts:32` `setInterval` with no `unref` |
| B1 webhook forwards cookie and every header | S1 | real, existed at e130 | `forward.ts:107-110` copies `c.req.raw.headers`, deletes only `authorization` and `host` |
| B3 webhook with Authorization gets 401 | S2 | real, existed at e130 | `server/routes.ts:23` authentication on `*`; :63-64 unknown bearer -> `invalid_token` 401 before feature routes |
| B4 dev sign-in through a local tunnel | S1 (dev) | real, existed at e130 | `node/vite.ts:47-51` trusts the socket's loopback address; a tunnel agent connects from loopback |
| B5 Host with default port disables cookie sign-in | S3 | plausible | `identity/session-cookie.ts` unchanged since e130 |
| B6 bulk delete of saves after downtime | S3 | plausible (documented) | aging measures against wall clock |
| B8 terminal can publish any channel | C | plausible | docs gap |

Partial-pair check: B2 is real. A script under Node 24 (`judge/hop2.mjs`) shows `fetch` throws "invalid transfer-encoding header", "expect header not supported", "invalid keep-alive header". MOSS-1 is also real: `new Request` with HEAD and a body throws, and `forward.ts:141` attaches a body to everything but GET.

### charter

| Pair | Type |
|---|---|
| CHARTER-1 (S1) - B1 (S1) unknown keys ignored, typo grants | full |
| CHARTER-2 (S1) - B2 (S1) string `allow` iterated by character, `*` grants all | full |
| CHARTER-3 (S3) - B4 (S3) `glob.ts:3` regex | partial (newline vs. backtracking) |

| Unmatched | Sev | Verdict |
|---|---|---|
| B3 `extends: ['constructor']` reaches prototype | S3 | plausible (resolve.ts unchanged) |
| B5 `RoleClosure` lacks `functions`; cycle reported repeatedly | C | plausible |

### nova

| Pair | Type | Note |
|---|---|---|
| NOVA-3 (S3) - B2 (S2) removeAt -1 deletes last | full | |
| NOVA-6 (C) - B5 (S3 + C note) | partial | Both on `action/compose.ts` stored-layout handling and the "deep-merged" description. A: a fragment's string layout replaces the action's (:24). B: an action's string layout is wrapped as text (:27). Different defects in the same lines |
| NOVA-6 (C) - B10 (C) | partial | Shared item: `$if` called the only directive form |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| B1 reconcile overwrites user-typed data | S2 | real, existed at e130 | `shell/reconcile.ts:32-33,65-66` compares new input with live data, not the previous row; ACTION_DOCS.md:332 says "its row's input changed" |
| NOVA-1 plain `obj[key]` lookups resolve built-ins | S3 | plausible (nova src unchanged) | |
| NOVA-2 map key differing from action id | S3 | plausible | |
| NOVA-4 NaN index -> raw ZodError, LIFECYCLE_ERROR | S3 | plausible | |
| NOVA-5 self-referencing stored layout overflows stack | S3 | plausible | |
| NOVA-7 README "~15 primitives" vs kits | C | plausible | |
| NOVA-8 prop readers copied DOM/TTY | C | plausible | |
| B3 `$.` reads loop scope first | S3 | plausible | |
| B4 text starting with `$` read as binding | S3 | plausible | |
| B6 failed trigger call silent in strict mode | S3 | plausible | |
| B7 push to undeclared canvas creates it | S3 | plausible | |
| B8 URL values not encoded | S3 | plausible | |
| B9 endpoint error body lost; GET `request`; `{{}}` model | S3 | plausible | |
| B11 nova not linted | C | plausible | |

### vex

| Pair | Type |
|---|---|
| VEX-3 (S1) - B1 (S1) unlocked PATCH/DELETE | full |
| VEX-4 (S3) - B5 (S3) identifiers never quoted | full |
| VEX-6 (S1) - B7 (S3) `semantic` `$scope` from caller context | full (severity differs) |
| VEX-11 (S3) - B8 (S3) literal `a.b` read as column | full |
| VEX-13 (C) - B12 (C) DESIGN says 403, code 400 | full (B12 is one item of VEX-13) |
| VEX-10 (S2 susp) - B11 (S3) | partial: both say the replay touch writes back a stale whole entry and reverts a newer one. B's main claim is the tiered cache's missing `entries()` |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| VEX-1 self-join: scope rule filters only the last copy | S1 | real | `scope/apply.ts:92,97` predicate path and alias-map key are `${entity}.${column}` for both copies, so the last alias wins; `resolver.ts:414` `entityLookup.set(source, …)` overwritten |
| VEX-2 entry `reach` checked only in HTTP handler | S1 | real | No `reach` in `engine/runtime.ts`; checks only in `handler.ts:351-427`. No direct `engine.execute` call found in moss src, so exposure is limited to in-process callers |
| VEX-5 adapter `schema:` introspects one schema, queries another | S1 | real | `postgres.adapter.ts:43,59` passes `schema` to introspection; `introspect.ts:346` stores bare `table_name`; `compile.ts:64` `FROM ${table}`; no `search_path` set anywhere |
| VEX-7 `mergeScopePolicies` tie keeps first role; drops public/deny | S2 | real | `scope/grants.ts:110,116` (`continue` on public/deny; strict `<`) |
| VEX-9 `variantsSeen`/`cutSaid` never cleared | S2 | real (impact bounded by fingerprint count) | `engine/runtime.ts:84,176` |
| VEX-8 discovery ignores tables inside `exists` | S3 | plausible (B noted the execution path still refuses) | |
| VEX-12 `.optional()` vs `.nullish()` | S3 | plausible | |
| VEX-14 duplicated gates/matchers/refusal block | C | plausible | |
| B2 `sortBy` orders by unselected columns | S1 | real, existed at e130 | `engine/runtime.ts:36-43`; the comment says resolve accepts any column of a `from` entity |
| B3 upsert with `id: null` updates nothing, answers 200 | S2 | real, existed at e130 | `mutations/engine.ts:387` `keyed` is true for `null`, giving `WHERE id = NULL` |
| B4 scope value `null` passes `requireScope` | S2 | real, existed at e130 (host-supplied null) | `engine/executor.ts:63` checks `=== undefined` only |
| B6 subquery `as` equal to generated alias dropped | S3 | plausible | |
| B9 missing context returns `[]` for object entry | S3 | plausible | |
| B10 `exists` inside aggregate `case` refused | S3 | plausible | |
| B13 style guide unenforced in vex | C | plausible | |
| B14 dead compiler branch | C | plausible | |

### prism

| Pair | Type |
|---|---|
| PRISM-1 (S2) - B3 (S3) reads follow prototype chain | full |
| PRISM-2 (S3) - B1 (S3) `$groupBy` raw TypeError | full |
| PRISM-3 (S2) - B2 (S3) `__proto__` key sets prototype | full |
| PRISM-5 (S3) - B4 (S3) bad locale RangeError | full |
| PRISM-6 (S3) - B11 (C) lenient path indexes `[0x1]`, `[1e0]` | full (PRISM-6 is one item of B11) |
| PRISM-7 (S3) - B10 (S3) deep source stack overflow | full |
| PRISM-4 (S3) - B6 (S3) `$date` parsing | partial (server timezone vs. accepting nonsense) |

| Unmatched | Sev | Verdict |
|---|---|---|
| PRISM-8 dispatch written twice | C | real (`evaluate.ts`, `optimize.ts`); B mentions it under Maintainability, not as a finding |
| PRISM-9 cache never emptied; `__op`/`__segments` defined twice; DESIGN | C | real (`evaluate.ts:40`, `optimize.ts:33-34`, `core.ops.ts:8`) |
| B5 `$replace` uses JS `$` patterns | S3 | plausible; same `replace(search, replacement)` at e130 |
| B7 Infinity/NaN math results | S3 | plausible |
| B8 `$eq` key-order dependent | S3 | plausible |
| B9 `$reduce` `as` = `acc` | S3 | plausible; same code at e130 |

### loom

| Pair | Type |
|---|---|
| LOOM-1 (S2) - B4 (S2) rename to existing key drops field | full |
| LOOM-5 (S3) - B5 (S3) hand-kept op list missing nine ops | full |
| LOOM-6 (S2) - B3 (S2) `_errors` field stripped | full |
| LOOM-7 (S2) - B2 (S2) non-object failing document replaced | full |
| LOOM-8 (S3) - B9 (S3) `onChange` captured at mount | full |
| LOOM-9 (S3) - B8 (S3) default order, enum discriminator | full (2 of 3 items shared) |
| LOOM-9 (S3) - B1 (S2) dotted key bound as nested path | full (third item of LOOM-9) |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| LOOM-2 "Add" name collides after delete | S2 | real | `plugins/vex/react/records.tsx:38` `field_${entries.length + 1}`, then `Object.fromEntries` |
| LOOM-4 recursive template names restart per `toNova` | S2 | real | `compile/to-nova.ts:236,243` counter local to the call; `editor/editor.ts:96` one shared store |
| LOOM-3 decimals cannot be typed | S3 | plausible (`coerceLiteral` at records.tsx:43-56) | |
| LOOM-10 untested plugins, duplicates | C | plausible | |
| B6 `parse` runs `safeParse(undefined)` | S3 | plausible | |
| B7 union `empty`/`includeOptional` ignored | S3 | plausible | |

### signal

| Pair | Type |
|---|---|
| SIGNAL-1 (S2) - B2 (S3) `.options({ signal })` never aborts | full |
| SIGNAL-2 (S3) - B3 (S3) aborted stream -> E_PROVIDER_ERROR | full |
| SIGNAL-6 (C) - B9 (C) provider request built twice | full |
| SIGNAL-3 (S2) - B2 (S3) | partial: B2's evidence names `chat()` taking no options; A makes "step() cannot be cancelled" its own finding |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| B1 cut-off reply accepted as complete | S2 | real, existed at e130 | `wire/router.ts` close-truncated rung (last rung at e130, moved ahead of extract at c5); `finishReason` never consulted |
| SIGNAL-4 `reasoningRequest` only in `chatStream` | S3 | real (`openai-compatible.adapter.ts:180` only) | |
| SIGNAL-5 zero-argument streamed tool gets `''` | S3 (susp) | plausible | |
| B4 multi-turn duplicates system prompt | S3 | plausible | |
| B5 Groq `tool_use_failed` -> empty success | S3 | plausible | |
| B6 `.apiKey()` ignored for custom provider | S3 | plausible | |
| B7 `stream()` throws synchronously | S3 | plausible | |
| B8 unknown wire id plain Error | C | plausible | |

SIGNAL-3 is real at c5b6cc4f: `types.ts:314` `chat: (request) => …` takes no signal.

### cortex

| Pair | Type |
|---|---|
| CORTEX-1 (S2) - B5 (S2) second `run.events` reader hangs | full |
| CORTEX-4 (S3) - B8 (S3) `String.replace` expands `$&` | full |
| CORTEX-6 (C) - B9 (C) | partial (shared item: preview repeats run's prompt assembly) |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| CORTEX-2 step transport: abort during model call can return ok | S2 | real | `loop/loop.ts:349-356` step branch has no signal and no abort check; output path returns `ok: true` |
| CORTEX-3 approval timer never cleared | S3 | real (`gates/approval.ts:26`) | |
| CORTEX-5 `prepareStep` llm swap keeps transport | S3 (susp) | plausible | |
| B1 `onToolResult` hooks never see errors | S1 (conditional) | real, existed at e130 | `loop.ts:300-305` hooks only in the success branch; the catch at :308 records the raw message |
| B2 run-level gates don't reach delegated runs | S1 (suspected impact) | real, existed at e130 | `manifold/as-tool.ts:71-77` child run options: deps, llm, signal, agentPath, onEvent, no gates |
| B3 tool timeout does not stop the tool | S2 | real, existed at e130 | `utils/timeout.ts` only rejects; the tool's `signal` is the run's abort (`loop.ts:160`) |
| B4 approvals in a delegated agent unanswerable from parent | S2 | real by reading, existed at e130 | `agent/run.ts:122` each run creates its own approval bridge |
| B6 `output.schema: z.string()` vs JSON-looking text | S3 | plausible | |
| B7 input array with `role` taken as transcript | S3 | plausible | |

### solid

| Pair | Type |
|---|---|
| SOLID-1 (S2) - B1 (S2) cubic cost on lists | full |
| SOLID-2 (S2) - B3 (S3) dotted record keys dropped | full |
| SOLID-4 (S2) - B4 (S3) parsing continues after root closes | full |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| SOLID-3 throwing listener aborts parse / escapes `write()` | S2 | real | `create-stream.ts:67-81` no try/finally; `isNotifying` stays true |
| B2 union kind-checked against first variant | S3 | plausible | |
| B5 `Infinity`, `0x1F` accepted | S3 | plausible | |
| B6 `instanceof` against own zod copy | C (susp) | plausible | |
| B7 no-op `write`/`close` on selected streams | C | plausible | |

### tide

| Pair | Type |
|---|---|
| TIDE-2 (S2) - B4 (S2) fan-in drained before facts written | full |
| TIDE-3 (S2) - B3 (S2) 4 x limit read blocks due facts | full |
| TIDE-6 (S2) - B6 (S3) unloaded reflex tasks burn attempts | full |
| TIDE-9 (C) - B9 (C) `ledger.facts` full scan; `duplicate_unit` reused | full (2 of 4 items) |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| TIDE-1 any `tz` string accepted | S2 | **gone at c5** (changed between commits) | `schemas/trigger.schema.ts` now has `TimeZoneSchema` with an Intl refine |
| TIDE-4 non-TideError fan-out retried forever | S2 | real | `engine/fanout.ts:74-84` only `isTideError` skips; a template error from the transform leaves the run `pending`, no backoff |
| TIDE-5 ≥ limit serial reflexes starve parallel claims (Postgres) | S2 | real | `store/postgres/claim.ts:43` `spec.limit - restricted.length`; `take` returns `[]` when ≤ 0 |
| TIDE-7 `timeoutMs` > `leaseMs` unchecked | S3 (susp) | plausible | |
| TIDE-8 `mintId` not collision-safe across processes | S3 (susp) | plausible | |
| B1 `manual` fact skips tenant and enabled checks | S1 | real, existed at e130 | `engine/match.ts:77` returns before the tenant check at :82 |
| B2 dedupe key omits tenant | S2 | real, existed at e130 | `types.ts:211` and `store/postgres/tables.ts:43-45` key has no `as` |
| B5 cycle check links reflexes of different tenants | S2 | real, existed at e130 | `engine/graph.ts:28-56` watchers keyed by entity / run id only |
| B7 `effectProblem` checks templated input as literal | S3 | plausible; function existed at e130 | |
| B8 one-off clock accepts 2026-02-30 | S3 | plausible; regex unchanged | |

### strata

| Pair | Type |
|---|---|
| STRATA-3 (S1) - B1 (S1) `workDir` recursive delete | full |
| STRATA-4 (S3) - B2 (S3) stamp values never checked | full: the lock goes through `upgrader.behind` -> `positionOf` (`documents.ts:115`), the same unchecked read B cites |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| STRATA-1 `verify` passes a schema-failing migration | S2 | real | `node/index.ts:139` writes `plan.json` even when `plan.problems` is non-empty; verify rebuilds the plan with `problems: []` (:169); `verifySourceUpgrade` (`upgrade/index.ts:114-148`) checks no schema; REPORT says "no edit can make verify pass" |
| STRATA-2 embedding paths unversioned | S2 | real by reading | `documents.ts:101-113,146` `locate` uses the current `embeds` patterns at every step |
| STRATA-5 155-line function, positional args, reused code, no concurrency test | C | real (B mentions the long function under Maintainability) | |
| B3 `--` lines dropped inside string literals before checksum | S3 | plausible; same filter at e130 | |
| B4 `prepare([null])` TypeError | S3 | plausible | |
| B5 `upgradeStore` locks everything; key-order compare; id collisions | C | plausible | |

### cli

| Pair | Type |
|---|---|
| CLI-1 (S1) - B1 (S1) `export --out` deletes folder | full |
| CLI-4 (S2) - B5 (S3) `--allow-live` writes undrawable path, exit 0 | full |
| CLI-2 (S3) - B7 (S3) busy port raw crash (+ others) | full (1 of 2 items of CLI-2) |

| Unmatched | Sev | Verdict | Evidence |
|---|---|---|---|
| B2 unknown flags ignored (`migrate --dry-run` applies) | S2 | real, existed at e130 | `cli.ts:29-57` flags read by `includes`; nothing rejects unknown ones |
| B3 compression cache keyed without query | S2 | real, existed at e130 (needs an `immutable` answer on a query path) | `site.ts:140` key = encoding + pathname + last-modified; Map never cleared |
| CLI-3 only `error.message` printed | S3 | real (`cli.ts:73`) | |
| CLI-5 test temp folder in fixtures; no tests for check/args | C | real; B names the temp folder in its Tests line, not as a finding | |
| B4 `fileOf` `..` with backslashes on Windows | S3 | plausible | |
| B6 shape check misses forms | S3 | **new code** (`src/shape/*` added after e130) | |
| B8 config loaded twice; one file | C | plausible | |

### create-nisc

| Pair | Type |
|---|---|
| CREATE-1 (S3) - B3 (S3) target is a file -> raw ENOTDIR | full |
| CREATE-2 (S3) - B2 (S3) file where a folder must go | full |
| CREATE-3 (S3) - B5 (C) `item.json` casts, not schema-checked | full |

| Unmatched | Sev | Verdict |
|---|---|---|
| CREATE-4 no cli tests; copied `all-checks`; welcome-check; `unverifiedShell` | C | real in part: the `unverifiedShell` item is gone at c5b6cc4f |
| B1 `ask` description says `{ text }`, schema needs `{ asked }` | S3 | **new code** (`AskSchema` with `asked` not at e130) |
| B4 model-first charter grants `ask` to public | S3 (susp) | real at both commits (`functions: ['ask', …]` under `public`) |
| B6 agents-section wrong name / count | C | plausible |
| B7 caret ranges beside pinned nisc | C (susp) | plausible |

### nisc (AGENTS.md)

| Pair | Type |
|---|---|
| NISC-1 (S2) - B1 (C) example breaks rule 2 | full |
| NISC-1 (S2) - B2 (C) example breaks rule 14 / ownerId from client | full |
| NISC-5 (S3) - B3 (C) websites named without location | full |
| NISC-6 (C) - B5 (C) | partial (shared item: rule 7b one huge paragraph). B's "Sizes" line repeats NISC-6's ~18k tokens, not counted |

| Unmatched | Sev | Verdict |
|---|---|---|
| NISC-2 rule 10a omits `artifacts`, `artifact_saves` | S3 | **gone at c5** (10a now lists both) |
| NISC-3 names monorepo-only `pnpm check:grammars` | S3 | real (rule 18, AGENTS.md:122) |
| NISC-4 rule 16 bans `as`/`!` "at the lint/typecheck level" | S3 | **gone at c5** (sentence replaced by a lint table that names its scope) |
| B4 `nisc.config.ts` "only if…" vs check/dev refuse | C | plausible |
| B6 root symlinks read as a path on Windows | C | plausible |

## Unmatched S1/S2: verdict summary

A-only, all checked at c5b6cc4f: 14 real (MOSS-2, VEX-1, VEX-2, VEX-5, VEX-7, VEX-9, LOOM-2, LOOM-4, CORTEX-2, SOLID-3, TIDE-4, TIDE-5, STRATA-1, STRATA-2), 1 gone (TIDE-1), 0 not real.

B-only, all checked: 17 real, and every one is in code that already existed at e130a625, so these are misses by A, not new code (moss B1, B3, B4; nova B1; vex B2, B3, B4; signal B1; cortex B1, B2, B3, B4; tide B1, B2, B5; cli B2, B3). 0 not real.

The partial-pair S2s are also real: moss B2 (by a Node script) and SIGNAL-3.
