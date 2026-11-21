# Package review, 2026-11-15: bug reports

The first review read the packages at `e130a625` (2026-10-28), 107 commits behind `origin/main` (`c5b6cc4f`, 2026-11-12). File and line references point at that older copy. Each fix starts by reproducing the bug on `origin/main`; a bug that no longer reproduces is marked "gone on main" and not touched.

Severity: **S1** grants access, leaks data or deletes files. **S2** loses or corrupts data, or stops work. **S3** wrong result or bad error on unusual input. **C** cleanup: docs, duplication, structure.

"Breaking?" names the case where an app that works today could stop working. Those fixes are not built without a separate yes.

## moss

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| MOSS-1 | S3 | `integrations/forward.ts:141` | A HEAD request through the integration proxy always answers 502. Hono serves HEAD with the GET handler, but `c.req.method` is `'HEAD'`, so a `body: ''` is attached and `new Request` throws "Request with GET/HEAD method cannot have body"; `sent()` reports that as unreachable. | HEAD `/…/integrations/<id>/x` against an installed integration → 502, integration never called. | No |
| MOSS-2 | S2 | `socket/revalidation.ts:59-75` | One session-verifier call that never answers stops all later re-check passes (the `passing` guard waits forever), so expired sessions keep their sockets. | Verifier returns a promise that never settles → no further pass runs. | No |
| MOSS-3 | C | `DESIGN.md:325,329-330` | DESIGN says moss updates and deletes no row of `artifacts`/`artifact_saves`; `data/aging.ts` deletes from both and `artifactory/saves.ts:161` updates `last_used_at`. | Read. | No |
| MOSS-4 | C | `data/aging.ts` | The aging timer is not `unref`'d, unlike every other moss timer. | Read. | No |

## charter

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| CHARTER-1 | S1 | `src/types.ts`, `moss/src/manifest/schema.ts:81` | Nothing checks the charter document's shape. A misspelt key (`denny`, `Deny`) is ignored, so the deny never applies, and `verifyCharter` reports no error. | `{ allow: ['crm.*'], denny: ['crm.*.delete'] }` grants `crm.deal.delete`. | Yes, if refused at boot: a charter with an unknown key booted before. Decide: error vs. refuse. |
| CHARTER-2 | S1 | `src/resolve.ts` | A string where a list belongs is iterated character by character; the `'*'` character then grants the whole universe. The verifier gives only warnings. | `allow: 'crm.deal.view*'` → every id granted. | Same as CHARTER-1 |
| CHARTER-3 | S3 | `src/glob.ts:3` | `*` compiles to `.*`, which does not match a line break, so a deny of `crm.*` misses `crm.a\nb`. | `matchGlob('crm.*', 'crm.a\nb')` → false. | No |

## nova

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| NOVA-1 | S3 | `shell/shell.ts:139-146`, `action/runtime/steps.ts:136`, `endpoints.ts:190` | Action, fragment and function lookups use plain `obj[key]`, so built-in names resolve. `push('main','toString')` spawns an instance whose definition is a function; an endpoint `fn: 'valueOf'` fails with a raw TypeError instead of `UnknownFunctionError`. `reconcilerOf` and `registerAction` already use `Object.hasOwn`. | `shell.push('main','constructor')`. | No |
| NOVA-2 | S3 | `shell-internals.ts:28`, `shell.ts:138` | An `actions` map key that differs from the action's `id` is accepted: pushing the key creates an instance with the other id, pushing the id throws, and `removeAction(key)` leaves the instance on screen. SHELL_DOCS says the map is keyed by id. | `actions: { a: { id: 'b', … } }`. | Yes, if refused: such a map loads today. |
| NOVA-3 | S3 | `action/mutations/ops/remove-at.ts:37-40` | `removeAt` with index `-1` deletes the last item (`splice(-1, 1)`); `move` refuses negatives. | `{ removeAt: '$.items', index: -1 }`. | Possibly: a layout relying on -1 meaning "last". |
| NOVA-4 | S3 | `steps.ts:74`, `mutations/registry.ts:15`, `triggers.ts:29` | An index template that resolves to nothing becomes `NaN`, the op's schema throws a raw ZodError, the rest of the step list is skipped, and the error is reported as `LIFECYCLE_ERROR`. The op's own NaN guard never runs. | `index: '{{$.missing}}'`. | No |
| NOVA-5 | S3 | `layout/renderer.ts:114-119` | A stored layout that refers to itself recurses until "Maximum call stack size exceeded" instead of being refused with a clear error. | Layout `x` containing a reference to `x`. | No |
| NOVA-6 | C | `action/schemas/index.ts:52`, `schemas/endpoints.ts:40`, `compose.ts:24`, `DESIGN.md:109` | Model-facing descriptions disagree with code: fragment data is described as "deep-merged" (it is shallow); the `fn` description omits that the name is resolved as a binding; a fragment `layout` given as a stored-layout id replaces the action's layout although the schema calls it a wrapping layout; DESIGN calls `$if` the only directive form (`$eq`, `$exists`, `$at`, `$prism` exist). | Read. | No |
| NOVA-7 | C | `README.md` | README promises every app renders in all five adapters with "~15 primitives"; the React and Vue kits ship 9 components, the DOM kit has no Badge. | Read. | No |
| NOVA-8 | C | `adapters/dom/components/props.ts`, `adapters/tty/components/props.ts` | The prop readers (`num`, `str`, `bool`) and the `ICON` table are copied between DOM and TTY. | Read. | No |

## vex

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| VEX-1 | S1 | `scope/apply.ts:54-55,96-97`, `engine/resolver.ts:414` | A table joined to itself: both copies file their row rule under the key `<table>.<column>`, so both rules compile against the last copy and the first copy is never filtered. Paths in the query also always resolve to the last copy. | `{ from: ['users','users'], aggregate: { n: { count: '*' } } }` with scope `tenantId: 'A'` counts tenant-B rows. | No |
| VEX-2 | S1 | `handler.ts:348-430`, `engine/runtime.ts:252-273` | An entry's `reach` is checked only in `handleQuery`; `engine.execute` never reads it, so an in-process replay is served with the caller's wider reach. DOCS says it "fails closed both ways". | Replay a reach-limited fingerprint through `engine.execute`. Check moss `data/routes.ts` (answerIntent) for exposure. | Possibly: an in-process caller that relies on wider reach. |
| VEX-3 | S1 | `handler.ts:476-511`, `hono/index.ts:85-127` | PATCH/DELETE on an unlocked mount have no authorization: a caller can unprotect a seeded entry and then delete or regenerate it, which changes what locked endpoints replay (fingerprints are global). README recommends exposing one unlocked endpoint. | PATCH an entry to unprotected, then DELETE it, through an unlocked mount. | Yes: a client using PATCH/DELETE today. Decide the rule. |
| VEX-4 | S3 | `compile.ts:39,64`, `resolver.ts:197`, `mutations/engine.ts:350,376` | Table and column names from the database are never quoted: a column `createdAt` fails ("column u1.createdat does not exist"), a table `order` is a syntax error, and a camelCase output inside a subquery breaks the outer reference (`sub.userName` → `sub.username`). The query agent's prompt tells the model to alias to camelCase shape keys. | Query a table with column `"createdAt"`. | No: these queries fail today. |
| VEX-5 | S1 | `postgres.adapter.ts:43,59`, `compile.ts:64` | The adapter's `schema:` option introspects `app.notes` but runs `FROM notes`, reading `public.notes`. | Two schemas with a `notes` table each, adapter `schema: 'app'`. | No |
| VEX-6 | S1 | `adapters/postgres/operators.ts:261,270`, `utils/context.ts:46` | A `$scope` value inside a `semantic` filter is read from the caller's context, so the caller can set a value the server is meant to supply. | `semantic` filter with `{ $scope: 'tenantId' }`, caller context `tenantId: 'B'`. | No |
| VEX-7 | S2 | `grants.ts:116` | `mergeScopePolicies`: when two rule sets tie on match count the first role wins, which is narrower than "anything any role permits"; it also drops `public`, `deny` and `default: 'allow'`. | Two roles with equal-count rule sets on one table. | Possibly: widens some callers' rows to what the docs promise. |
| VEX-8 | S3 | `handler.ts:161-177` | Discovery's `collectTables` ignores tables used inside `exists`, so an entry is listed to a caller who cannot read those tables. | Entry with `exists` over a table the caller cannot read. | No |
| VEX-9 | S2 | `engine/runtime.ts:84,176` | `variantsSeen` and `cutSaid` grow for every minted fingerprint and are never cleared. | Long-running engine. | No |
| VEX-10 | S2 (suspected) | `engine/runtime.ts:236-239` | The fire-and-forget touch writes back the whole entry it read, so it can undo a concurrent PATCH or reseed. | Touch racing a PATCH. | No |
| VEX-11 | S3 | grammar | A string literal shaped like `a.b` (e.g. `"example.com"`) is always read as a column; nothing forces a literal. | `{ eq: ['users.domain', 'example.com'] }`. | Additive form only. |
| VEX-12 | S3 | model-facing schemas | `.optional()` used 36 times, `.nullish()` 0, against the style guide; a model that sends `"limit": null` is rejected. | Query with `"limit": null`. | No (accepts more). |
| VEX-13 | C | `DESIGN.md`, `vexGuide` | DESIGN says a locked endpoint returns 403 (code and DOCS: 400); decisions numbered out of order; file map omits `agent/compact.ts`, `agent/declared.ts`, `migrations/`; `vexGuide` says missing-context queries "ran" (they return `[]` without running). | Read. | No |
| VEX-14 | C | `handler.ts`, `grants.ts` | Duplicates: `canWriteTable` vs `writeGate`, `readMatchesFor` vs `matchesFor`, the reach-refusal block twice in `handler.ts`. | Read. | No |

## prism

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| PRISM-1 | S2 | `utils/jsonpath.ts:90`, `ops/core.ops.ts:33,60`, `object.ops.ts:39`, `string.ops.ts:26,35`, `transform.ops.ts:32` | Inherited properties are read as data. `{$ref:'$.constructor'}` on `{}` returns the `Object` function; `{$var:'toString'}` returns a function; `$pick ['constructor']` puts a function in the output; `{{constructor}}` in `$interpolate`/`$fill` prints `function Object() { [native code] }`; `$renameKeys` on data with a key `constructor` renames it to that text (data-triggered; strata migrations use `$renameKeys`). | As listed. | No |
| PRISM-2 | S3 | `ops/structure.ops.ts:67-68` | `$groupBy` with a group key `constructor`, `toString`, `valueOf` or `__proto__` throws a raw TypeError, not a PrismError; `evaluateSafe` returns an error with no `code`. | Group `['constructor']` by itself. | No |
| PRISM-3 | S2 | `$merge`, `$omit`, `$keyBy`, `$fromEntries`, templates | A `__proto__` key (which `JSON.parse` produces) disappears and its fields become readable through the result's prototype (`r.isAdmin === true`); a template key `__proto__` is dropped while validation says ok. | `$merge` with `JSON.parse('{"__proto__":{"isAdmin":true}}')`. | No |
| PRISM-4 | S3 | `ops/time.ops.ts:19` | `$date` on a datetime with no zone uses the server's timezone: `08:00Z` in Vienna, `17:00Z` with TZ=America/Los_Angeles. | `TZ=… $date '2026-01-01T09:00'`. | Yes, if changed to UTC. Docs-only unless approved. |
| PRISM-5 | S3 | `ops/intl.ops.ts:53,124` | `$localeNumber`/`$localeDate` with a bad locale from data (`de_AT`) throw RangeError; `$localeMoney` catches the same case. | `locale: 'de_AT'`. | No |
| PRISM-6 | S3 | `utils/jsonpath.ts` | The path parser accepts `$.a.`, `$.a[0]b`, `$.[0]`, `[1e0]`, `[0x1]`. | Parse each. | Possibly: a config using one of these. Report, don't refuse. |
| PRISM-7 | S3 | deep sources | A source nested ~20,000 deep overflows the stack with RangeError, not `E_BUDGET`. | Deep array. | No |
| PRISM-8 | C | `engine/evaluate.ts:96-170`, `engine/optimize.ts:70-137` | Operator dispatch written twice (~65 branches each). | Read. | No |
| PRISM-9 | C | `jsonpath.ts:74`, `evaluate.ts:39`, `core.ops.ts:8`, `DESIGN.md` | The parsed-path cache is never emptied; `'__op'`/`'__segments'` defined twice; DESIGN says the IR primes the path cache (it attaches segments) and keeps history. | Read. | No |

## loom

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| LOOM-1 | S2 | `plugins/prism/react/node-editor.tsx:308-310`, `plugins/vex/react/records.tsx:29` | Renaming a key to a name that already exists silently deletes the other entry. | Rename `b` to `a` in `{a,b}`. | No |
| LOOM-2 | S2 | `plugins/vex/react/records.tsx:38` | "Add" names the new entry `field_${length+1}`; after a delete that name can exist and is overwritten. | Add 2, delete first, add. | No |
| LOOM-3 | S3 | `records.tsx:43-58` | Every keystroke in a vex compute operand is converted to a number, so `"1."` becomes `1` and decimals cannot be typed. | Type `1.5`. | No |
| LOOM-4 | S2 | `compile/to-nova.ts:236,243`, `editor/editor.ts:96` | Recursive template names (`loom:tree:N`) restart at 0 on every `toNova` call and all documents share one layout store, so two recursive schemas overwrite each other's templates. | Two recursive schemas in one plugin. | No |
| LOOM-5 | S3 | `node-editor.tsx:14-25,156` | The prism node picker's hand-kept `OP_CATEGORY` misses 9 ops (`$fill`, `$has`, `$renameKeys`, `$update`, `$assert`, `$walk`, `$localeDate`, `$localeMoney`, `$localeNumber`); their category "Other" is not in `CATEGORY_ORDER`. The style guide bans a hand-kept op list beside the schema. | Open the picker. | No |
| LOOM-6 | S2 | `validate.ts:28-51` | A field named `_errors` is stripped, overwritten by the error tree, then flagged missing. | Schema with `_errors`. | No |
| LOOM-7 | S2 | `editor/editor.ts:97` | A non-object document that fails its schema opens as empty (`[]`), and the next save loses it; an object that fails is kept. | Stored list with one bad item. | No |
| LOOM-8 | S3 | `loom-editor.tsx:28-58` | `onChange` is captured once at mount; README says only `plugins` and `artifact` are read once. | Change the `onChange` prop. | No |
| LOOM-9 | S3 | `compile/parse.ts:75,172` | `.default('a').default('b')` starts at `'a'` (Zod gives `'b'`); a discriminated union with an enum discriminator gets tag `undefined`; a key containing a dot is bound as a nested path. | As listed. | No |
| LOOM-10 | C | plugins | No tests for the prism node editor, the vex widgets, the vex preview or the nova plugin; inline colours; `validation.tsx` and `jsonviewer.tsx` identical; `stripErrors` twice; `LoomEditorPlugin` copies `LoomPlugin`. | Read. | No |

## signal

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| SIGNAL-1 | S2 | `types.ts:72`, `signal.ts` `complete`, `DOCS.md:144` | `.options({ signal })` is never read; a pre-aborted signal still completes. DOCS says it aborts. | Pre-aborted controller, `complete('hi')` → returns "Hello". | No |
| SIGNAL-2 | S3 | `stream/execute-step-stream.ts:280,316`, `run.ts:126` | An aborted `stream(…, { signal })` throws `E_PROVIDER_ERROR` "stream ended without a done event" instead of ending as an abort. | Abort mid-stream. | No |
| SIGNAL-3 | S2 | `adapters/openai-compatible.adapter.ts:202` | `step()` cannot be cancelled: `adapter.chat` takes no signal. | — | No (optional parameter) |
| SIGNAL-4 | S3 | `openai-compatible.adapter.ts:239` | `reasoningRequest` (e.g. Groq `reasoning_format: 'parsed'`) is added to `chatStream` only, not `chat`, so `step()` and `stepStream()` send different requests. | Compare the two request bodies. | Possibly: changes what `step()` sends to reasoning providers. |
| SIGNAL-5 | S3 (suspected) | `execute-step-stream.ts:322` | A streamed tool call with no argument fragments keeps `args` as `''`, so a zero-argument tool fails its input check. | Provider sends no argument deltas. | No |
| SIGNAL-6 | C | `signal.ts:232-251`, `execute-step-stream.ts:241-263`, `router.ts:369` | Provider request built twice; module-level id counter. | Read. | No |

## cortex

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| CORTEX-1 | S2 | `events/channel.ts:20,66,75,120` | One shared `wake` variable: with two concurrent readers of `run.events`, one never finishes. `onRun: trace.attach(run)` plus the app's own `for await` is this case. | Two `for await` over `run.events`. | No |
| CORTEX-2 | S2 | `loop/loop.ts:462-504`, `types.ts:11` | In `transport: 'step'`, an abort during the model call can still return `ok: true`: no abort check after `oneStep`, and `SignalClient.step` takes no signal. | Abort during a step call. | No |
| CORTEX-3 | S3 | `gates/approval.ts:45` | The approval timeout timer is never cleared and keeps Node alive for up to `approvalTimeoutMs`. | Approve quickly, watch the process. | No |
| CORTEX-4 | S3 | `loop/loop.ts:523,540` | `String.replace` with a string replacement: `$$`, `$&`, `$'` in the quoted model text are rewritten. | Evidence containing `$$5` → `$5`. | No |
| CORTEX-5 | S3 (suspected) | `agent/run.ts:102-113` | A `prepareStep` that swaps `llm` keeps the transport resolved for the first model. | Swap to a provider without `response_format`. | No |
| CORTEX-6 | C | `README.md`, `DESIGN.md` §12-14, `agent/preview.ts:46-98`, `estimateTokens` | README quick example runs `new Function` on model text; `output_invalid` error code is never produced but documented; DESIGN keeps history; preview repeats run's prefix assembly; token estimate duplicates signal's `count()`. | Read. | No |

## solid

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| SOLID-1 | S2 | `finalization-tracker.ts:186-207` | Large arrays of objects take time roughly cubic in their length: each new index re-walks every earlier sibling and scans every container. 500 rows 0.34 s, 1,000 rows 2.4 s, 2,000 rows 21 s (50-char chunks of `{rows:[{id,name}]}`). Contradicts README and DESIGN "O(events)". | As measured. | Proposal first (owner asked how). |
| SOLID-2 | S2 | path join/split | A key containing a dot is dropped: `{"files":{"index.ts":…}}` against `z.record` fails "expected <unknown path>"; strict mode fails the stream. | As shown. | No |
| SOLID-3 | S2 | `create-stream.ts:67-81` | A throwing `onError` listener aborts the parse mid-chunk; a throwing `on` listener propagates out of `write()`. | `{"n":"bad","t":"kept?"}` with throwing `onError` leaves `t` empty. | No |
| SOLID-4 | S2 | parser | Text after the root value overwrites it: `{"a":"x"} {"a":"y"}` resolves `final()` to `{"a":"y"}`. | As shown. | Possibly: a caller that streams two values. Decide ignore vs. error. |

## tide

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| TIDE-1 | S2 | `trigger.schema.ts:19`, `occurrence.ts:89` | `tz` accepts any string; `load` succeeds, then every `advance` throws, and nothing after that step runs, so unrelated reflexes stop. A model writes `tz`. | `tz: 'Europe/Viena'`. | Refusing at load: only a reflex that never worked. |
| TIDE-2 | S2 | `engine/execute.ts:251-272` | Fan-in: up to 200 runs are marked `drained` in one write, their facts written afterwards outside any transaction. A crash or throw in between loses the facts. Docs say "exactly once". | One failing fact insert → downstream reflex never fires. | No |
| TIDE-3 | S2 | `match.ts:108-115` | Reads 4 × limit facts ordered by `at`, then drops those whose `notBefore` is in the future: 400 delayed facts at the head block every due one. | 400 delayed facts then one immediate. | No |
| TIDE-4 | S2 | `engine/fanout.ts:80` | A fan-out that fails with anything other than `TideError` (e.g. a broken template) stays `pending` and retries forever without backoff; 100 such runs block every other fan-out. | Broken template × 100. | No |
| TIDE-5 | S2 | `store/postgres/claim.ts:146` | Postgres only: one slot is reserved per serial reflex before anything else; with ≥100 serial reflexes, parallel tasks are never claimed. Memory store differs; `STORE_CONTRACT` doesn't catch it. | 100 serial reflexes + 1 parallel task. | No |
| TIDE-6 | S2 | `engine/execute.ts:77-78` | Tasks of a reflex that is not loaded are claimed and then skipped; each lease adds an attempt, so after reload the first error fails the task outright. | Unload a reflex, wait several leases. | No |
| TIDE-7 | S3 (suspected) | load | A policy `timeoutMs` longer than `leaseMs` is not checked; a second instance can take the task back mid-effect. | — | Refusing at load could refuse a reflex that loads today. Warn. |
| TIDE-8 | S3 (suspected) | `store.ts:11` | `mintId` = ms + per-process counter; two processes can collide (unique-key error). Not UUIDs. | — | Id format change: decide. |
| TIDE-9 | C | `tide.ts:245`, `fanout.ts:15`, DOCS, README | `ledger.facts({ reflexId })` reads the whole fact table; `duplicate_unit` reused for "exceeds maxFanOut"; a garbled retention sentence; README keeps `arm`/`disarm` history. | Read. | No |

## strata

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| STRATA-1 | S2 | `node/index.ts:349` | `strata verify` passes and moves the lock even when the migrated artifact fails the current schema (`problems: []`; `verifySourceUpgrade` checks no schema). README: "no edit could pass". | Edit source to match `upgrade`'s expected JSON for a schema-failing artifact; run verify. | No |
| STRATA-2 | S2 | `documents.ts:146` | Embedding paths have no version; `locate` uses current paths, so renaming `children` → `items` upgrades only the root and stamps nested nodes current. | Grammar migration renaming the embedding key. | No |
| STRATA-3 | S1 | `node/index.ts:311,362` | `rmSync(workDir, { recursive })` with no check that it lies strictly inside `root`: `workDir: '.'` deletes the project; by default `verify` deletes all of `.strata`, not `.strata/upgrade`. | `workDir: '.'`. | No |
| STRATA-4 | S3 | lock read | A lock value that is not a number becomes `NaN` and passes as current. | Lock `"x"`. | No |
| STRATA-5 | C | `runSourceUpgrade`, `renderReport`, `diffLines`, error codes | 155-line function for four commands; 7 positional arguments; `INVALID_SEQUENCE` reused for three unrelated errors; no test of two concurrent migrations though README promises they serialize. | Read. | No |

## cli

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| CLI-1 | S1 | `commands.ts:126` | `nisc export --out .` deletes the app's root (`rmSync(out, recursive)` unguarded); `--out dist` deletes the bundle. | Scratch copy of the fixture, `nisc export --out .`. | No |
| CLI-2 | S3 | `commands.ts:176,198` | A busy port crashes `nisc start` with "Unhandled 'error' event"; `--port abc` gives Node's own message. | Port in use. | No |
| CLI-3 | S3 | `cli.ts:70` | Only `error.message` is printed, so an error inside the app's `boot` has no location. | Throw in `boot`. | No |
| CLI-4 | S2 | `commands.ts:152` | `--allow-live` groups paths that failed to draw with live paths; they are written as the undrawn template and the command exits 0 (`build` exits 1). | A path whose draw throws, `export --allow-live`. | No |
| CLI-5 | C | `test/bundle.test.ts:27` | The test makes its temp folder in `test/fixtures/`, so an interrupted run leaves `bundled-*` behind. Tests that spawn `bin/nisc.js` run whatever `dist` was built last. No tests for `nisc check`, argument parsing, `--out` safety. | Read. | No |

## create-nisc

| ID | Sev | Where | What | Reproduce | Breaking? |
|---|---|---|---|---|---|
| CREATE-1 | S3 | `cli.ts:103` | A target that is a file gives a raw "ENOTDIR … scandir"; the friendly check in `generate.ts:158` is never reached. | Target path is a file. | No |
| CREATE-2 | S3 | collision check | A file blocking a needed folder (a file named `src`) is missed and gives a raw ENOTDIR on mkdir. | File `src` in the target. | No |
| CREATE-3 | S3 | `catalog/items.ts:64-83` | `item.json` checks only `id`, then four casts; a malformed `requires`/`with`/`env`/`docs` fails later with no hint which file. | Malformed item.json. | No |
| CREATE-4 | C | templates, `cli.ts` | `cli.ts` has no tests; `all-checks.ts` copied into three templates; `welcome-check` asserts by searching JSON strings rather than `nova/reflect`; the model-first template uses `unverifiedShell` (rule 7b says not to). | Read. | Template change: check it still builds. |

## nisc (AGENTS.md)

| ID | Sev | What |
|---|---|---|
| NISC-1 | S2 | The worked example breaks rules 2 (`maxWidth: 900`, `gap: 20` in a layout), 8 (`ownerId` sent from the client) and 14 (`input` not on the definition), and reads `done`/`due_display`, which its DSL does not select. |
| NISC-2 | S3 | Rule 10a's engine-table list omits `artifacts` and `artifact_saves`. |
| NISC-3 | S3 | Verification names `pnpm check:grammars` and `pnpm check:sources`, which exist only in the monorepo. |
| NISC-4 | S3 | Rule 16 bans `as` and `!` "at the lint/typecheck level"; create-nisc ships no linter and `tsc` catches neither. |
| NISC-5 | S3 | Points to nisc-website and moccadroid-website with no location; "both exemplars" names nothing. |
| NISC-6 | C | ~12k words / ~18k tokens; rule 7b is one 854-word line; "Failure modes" tells a private app's story; package-maintainer material (and the shipped STYLE_GUIDE's eslint/`check-modules` mechanics) ships to app authors. |

---

# Outcome (2026-11-15)

Each group was fixed on its own branch from `origin/main` (`c5b6cc4f`), reviewed by an independent agent, and given one round to answer that review. Nothing is pushed or merged. Branches: `review-fix/moss-charter`, `review-fix/nova`, `review-fix/vex`, `review-fix/prism-loom`, `review-fix/signal-cortex-solid`, `review-fix/tide-strata`, `review-fix/cli-create`, `review-fix/nisc-docs`. `review-fix/all-check` merges all eight for testing only.

Status words: **fixed**; **partly** (what is left is named); **unbuilt** (a fix would break a working app or needs a new mechanism: a decision); **docs** (behaviour unchanged, documented); **gone** (no longer reproduces on main).

| ID | Status | Note |
|---|---|---|
| MOSS-1 | fixed | |
| MOSS-2 | fixed | Each verifier answer is acted on when it arrives; a hung answer leaves only its own socket unchecked. |
| MOSS-3 | fixed | DESIGN and DOCS. |
| MOSS-4 | fixed | |
| CHARTER-1 | partly | A misspelt key is a warning printed at boot; the charter still boots. Refusing it is a decision. |
| CHARTER-2 | fixed | A string where a list belongs is that one pattern. Changes grants both ways (see decisions). A `deny`/`without` that cannot be read is an error. |
| CHARTER-3 | fixed | |
| NOVA-1 | fixed | Every lookup of a document name, kits and head included. |
| NOVA-2 | partly | Reported to `onError`; not refused. |
| NOVA-3 | unbuilt | Every form changes what some app sees. |
| NOVA-4 | fixed | |
| NOVA-5 | fixed | Loops over the same data included; recursive trees still render. |
| NOVA-6, 7, 8 | fixed | |
| VEX-1 | fixed | Row rules per source alias. |
| VEX-2 | unbuilt | moss `answerIntent` is exposed. |
| VEX-3 | unbuilt | Breaking; docs warn. |
| VEX-4 | fixed | Names quoted only when Postgres would not read them back as written. |
| VEX-5 | unbuilt | Reads and writes must use the same schema; needs a new option. |
| VEX-6 | fixed | |
| VEX-7 | docs | Needs an OR of rule sets or a widening change. |
| VEX-8, 9 | fixed | |
| VEX-10, 11 | unbuilt | Each needs a new option or grammar form. |
| VEX-12 | partly | Agent tool arguments accept null; a query with a null optional key is still refused (changing the exported schema breaks callers). |
| VEX-13, 14 | fixed | |
| PRISM-1, 2, 3 | fixed | Data keys; a `__proto__` key in a config is documented, not refused. Cost now ~3–7% on a few benchmarks. |
| PRISM-4 | docs | |
| PRISM-5, 7, 8, 9 | fixed | |
| PRISM-6 | unbuilt | Report only. |
| LOOM-1 to 8 | fixed | Renames that clash are shown, not applied. |
| LOOM-9 | partly | Enum discriminators and chained defaults fixed; dotted keys need nova path escaping. |
| LOOM-10 | partly | Plugin tests and duplicates done; inline colours listed (the kit has no tokens). |
| SIGNAL-1, 2, 3 | fixed | One rule for aborts; no listener kept on a long-lived signal. |
| SIGNAL-4 | unbuilt | Changes what `step()` sends to a provider. |
| SIGNAL-5 | partly | Fixed in signal's own loop and in cortex; what the stream emits is unchanged. |
| SIGNAL-6 | fixed | |
| CORTEX-1 to 4 | fixed | |
| CORTEX-5 | docs | |
| CORTEX-6 | partly | `estimateTokens` copy stays (removing it needs a newer signal). |
| SOLID-1 | proposal | See decisions. |
| SOLID-2, 3 | fixed | |
| SOLID-4 | unbuilt | Changes output for a stream with two values. |
| TIDE-1 | gone | main checks `tz`. |
| TIDE-2 | fixed | Each run's mark and fact land in one transaction, one run at a time. |
| TIDE-3 | fixed | |
| TIDE-4 | unbuilt | Needs a new column and run field (hosts would have to migrate). |
| TIDE-5 | partly | Postgres no longer reserves room for serial reflexes with nothing due; the store contract is unchanged. |
| TIDE-6 | fixed | `nextDue` ignores tasks of unloaded reflexes. |
| TIDE-7 | fixed | Warning at load. |
| TIDE-8 | unbuilt | Id format. |
| TIDE-9 | partly | Narrower read, docs; `duplicate_unit` kept. |
| STRATA-1 | fixed | In the CLI; the exported `verifySourceUpgrade` still checks no schema (README says so). |
| STRATA-2 | docs | Workaround documented and tested. |
| STRATA-3 | fixed | Only files the plan wrote, only inside `expected/`. |
| STRATA-4 | partly | The lock reader refuses non-numbers; stored stamps unbuilt. |
| STRATA-5 | partly | Split into functions; error codes kept. |
| CLI-1 | partly | Refuses the app folder, folders above it and the build; any other folder is still emptied. Decision. |
| CLI-2, 3, 5 | fixed | |
| CLI-4 | unbuilt | Exit code of a passing case. |
| CREATE-1, 2, 3 | fixed | |
| CREATE-4 | partly | `cli.ts` tests, `welcome-check` on `nova/reflect`; `unverifiedShell` gone on main; `all-checks.ts` copies kept; create-nisc's cli test runs `dist`. |
| NISC-1, 3, 5 | fixed | |
| NISC-2 | gone | |
| NISC-4 | gone | Rule 16 now says what checks it. |
| NISC-6 | partly | Longest line 112 words; maintainer rules in `CHANGING_A_PACKAGE.md`; still ~10.6k words. |

# Second review: findings not in the list above

A second, blind group reviewed `origin/main`. A judge matched the two reviews: 32% agreement overall, 44% on S1/S2; every serious finding from either side that it checked was real. These are the serious ones only the second review found. None is fixed; each needs the owner's go.

| Package | Sev | Finding |
|---|---|---|
| moss | S1 | The webhook route forwards every header except `authorization` and `host` to the integration's server, the session cookie included (`integrations/forward.ts`). |
| moss | S2 | A webhook with `Transfer-Encoding: chunked` or `Expect: 100-continue` always gets 502. |
| moss | S2 | A webhook carrying `Authorization` is answered 401 by core authentication before the hook runs. |
| moss | S1 (dev) | `/dev/as/<who>` trusts loopback, so a local tunnel lets anyone sign in. |
| nova | S2 | Re-running the same reconcile resets fields the user typed. |
| vex | S1 | `sortBy` can order by any column of a `from` table, even unselected (leaks ordering). |
| vex | S2 | `upsert` with `id: null` updates nothing and answers 200. |
| vex | S2 | A `null` scope value passes `requireScope`; a write stamps the owner column NULL. |
| signal | S2 | A reply cut off by the length limit is accepted as complete data. |
| cortex | S1 | `onToolResult` hooks never see errors, so a redacting hook is skipped. |
| cortex | S1 | Run-level `gates` don't reach delegated child runs. |
| cortex | S2 | A tool timeout doesn't stop the tool. |
| cortex | S2 | Approvals inside a delegated agent can't be answered. |
| tide | S1 | A `manual` fact skips the tenant and enabled checks. |
| tide | S2 | Dedupe ignores the tenant: tenant B's fact is dropped when A used the same key. |
| tide | S2 | The cycle check links reflexes of different tenants. |
| cli | S2 | Unknown flags are ignored: `nisc migrate --dry-run` really migrates. |
| cli | S2 | The compression cache ignores the query string: one user's body served to another. |

The full comparison: [2026-11-15-review-comparison.md](2026-11-15-review-comparison.md).
