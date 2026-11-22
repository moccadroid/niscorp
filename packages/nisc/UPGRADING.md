# Upgrading to @niscorp/nisc 0.11.0

This is a review-and-fix release. Every package was reviewed; the holes found are closed, and every change an app can see is declared here with what to do about it. No table, grammar or stored document changes: nothing migrates, there is no `strata upgrade` and no `nisc migrate` to run. Most apps change nothing. The few code patterns that need a change are listed first, under "Do these before you upgrade".

| Package | From | To |
|---|---|---|
| `@niscorp/nisc` | 0.10.0 | 0.11.0 |
| `@niscorp/charter` | 0.1.5 | 0.2.0 |
| `@niscorp/cli` | 0.9.1 | 0.10.0 |
| `@niscorp/cortex` | 0.1.6 | 0.2.0 |
| `@niscorp/haptic` | 0.2.0 | 0.3.0 |
| `@niscorp/loom` | 0.5.0 | 0.6.0 |
| `@niscorp/moss` | 0.9.3 | 0.10.0 |
| `@niscorp/nova` | 0.5.2 | 0.6.0 |
| `@niscorp/prism` | 0.3.4 | 0.4.0 |
| `@niscorp/signal` | 0.1.9 | 0.2.0 |
| `@niscorp/solid` | 0.1.3 | 0.2.0 |
| `@niscorp/strata` | 0.1.9 | 0.2.0 |
| `@niscorp/tide` | 0.1.12 | 0.2.0 |
| `@niscorp/vex` | 0.4.5 | 0.5.0 |

## How to upgrade

1. Go through "Do these before you upgrade" and make the changes that apply to the app.
2. Bump every `@niscorp` package the app lists, together, to the version in the table (`@niscorp/nisc` to `0.11.0`). Below 1.0 a caret range does not cross a minor: `^0.9.3` never installs `0.10.0`, so write the new versions out. Do not mix old and new packages; the set is tested only as a whole.
3. Install, then run the app's checks and tests (`npm run check`, `npm test`).

## Do these before you upgrade

Each line is a pattern to search the app for, and the change to make where it is found. Every other change in this release needs nothing from an app.

- **vex, moss: an update that hands a row over.** Search the update and upsert entries for a column that the table's write or update rule pins with `match:` (`owner_id`, `project_id`, `account_id`), written to a value outside that rule. Such a write is now refused with 400 `scope_denied`. If the app means it (handing a task to someone else), set `runtime.checkMovedRows: false` in moss, or `mutations: { …, checkMovedRows: false }` on a vex handler or adapter.
- **moss: an integration that reads the visitor's session at its webhook.** Search the integration's service for `cookie`, `proxy-authorization` or `x-operator-key` read on a `/hook/` request, and for a vendor callback page (OAuth `form_post`, SAML POST) that posts into the app and expects the visitor to be signed in. The door now strips those headers, and a page served through it runs with no origin. Carry what the integration needs in the request itself (a signed `state` value), not in the app's session.
- **cortex: a tool that passes `ctx.signal` to long work.** Search for `ctx.signal` in tools, and for `asTool(` and `manifold.asTool(`. A tool's signal now aborts at its `timeoutMs` (30 s by default; 300 s for a delegated agent). Set `timeoutMs` on each tool whose work may take longer.
- **cortex: an `onToolResult` hook.** Search for `onToolResult`. Hooks now also run when a tool threw or timed out. A hook meant for results only starts with `if (observation.kind !== 'result') return;`.
- **cortex: a snapshot taken while a tool runs.** Search for `run.snapshot()` called inside a tool or before `tool-end`, and for `resumeRun`. A resumed run now runs that call again. Take the snapshot after `tool-end`, or make the tool safe to run twice.
- **cli: `nisc export --out <dir>`.** Search scripts and CI for `--out`. Only the files the previous export recorded are removed, so pages an older export left there stay. Where the folder must contain only the export, empty it yourself before the export.
- **charter: a string where a list belongs.** Search the charter for `allow: '`, `deny: '`, `actions: '`, `data: '`, `extends: '`. A string is now one pattern, where each character was one (so a `*` in it granted everything). Write it as a list and check the role grants what it should.
- **nova: an `onError` that switches over error codes.** Search for `switch (` on `error.code` or `ErrorCode` with an exhaustive `never` check. `ErrorCode` gains `'ENDPOINT_FAILED'` and `'HANDLER_FAILED'`; add both cases.
- **prism: `$replace` with `$` in its replacement.** Search for `$replace` whose `replacement` contains `$$`, `$&`, `` $` `` or `$'`. The replacement is now written as given: write `"US$5"` where you wrote `"US$$5"`.
- **prism: code that catches `RangeError` or `TypeError` around prism.** Options Intl refuses are now a `PrismError` with code `E_SCHEMA`. Catch `PrismError` (or read `code`).
- **signal: a stream that detects an abort by its error.** Search for a `catch` around `for await` over `stream()` that looks for "stream ended without a done event". An aborted `stream()` now ends without a `done` event and without throwing; check `signal.aborted` after the loop.
- **signal: `complete()` or `stream()` without `.schema()` on Groq.** Search for calls with no `.schema(` that treat `''` as an answer. A rejected reply nothing was recovered from now throws `SignalError` `E_PROVIDER_ERROR`; catch it there.
- **strata: stamps in a `text` column, or a `workDir` of your own.** Search for `upgradeStore(` over a table whose stamp column is `text`: change the column to `jsonb` in an appended migration. Search for `strata upgrade` with `workDir`: if that folder has a `REPORT.md` or `plan.json` of your own, give strata a folder of its own.
- **tide: a sort on a tide table that breaks ties on `id`.** Search for `tide_run.created_at`, `tide_fact.created_at`, `tide_task.created_at`, and for code that parses ids starting `fact_`, `run_` or `task_`. New ids are UUIDs. Break ties on `due_at`, then `id`: `[{ field: 'tide_run.created_at', dir: 'desc' }, { field: 'tide_run.due_at', dir: 'desc' }, { field: 'tide_run.id', dir: 'desc' }]`.
- **tide: `ingest` of a `manual` or `run` fact.** Search for `ingest(` with `kind: 'manual'` or `kind: 'run'`. A manual fact now reaches only reflexes of its own `as`; a run fact is refused. Call `fire(reflexId, { now, input, by })` instead.
- **vex: a cache wrapper that overrides `set`.** Search for a cache made by spreading `createPostgresCache(…)`, `createMemoryCache(…)` or `createTieredCache(…)` and overriding `set`. "Last used" stamps now go through the `touch` it inherits; override `touch` too if the wrapper must see them.
- **vex: a semantic filter with `$scope`.** Search for `semantic:` with `$scope`. The text now comes from the scope values the host supplies, never from the caller's context; a request without it is refused with `missing_scope`. Supply that scope value from the server.

<!-- P7 -->
- **prism: a date built from parts.** Search for `$date`, `$dateAdd`, `$dateDiff` and `$localeDate` fed by `$join`, `$interpolate` or `$fill`, above all a year joined to a stored month and day. An impossible date such as `2027-02-29` is now `E_DATE_INVALID`, and inside `$map` one such item fails the whole list. Build the date so it exists: for a 29 February in a common year, use 28 February or 1 March (a `$case` on the joined text before `$dateAdd`).

---

## @niscorp/charter

### A string where a list belongs is read as one pattern
- Before: `allow: 'crm.deal.view*'` was read one pattern per character, and its `*` granted every id. A misspelt key (`denny`, `Deny`) was ignored without a word, and a value that was no list of strings could crash `verifyCharter`.
- Now: `allow: 'crm.deal.view*'` grants `crm.deal.view*` only. `verifyCharter` reports such a string, and every key it does not read, as a `shape` warning; any other value that is no list of strings grants nothing (a warning), and in `deny`, `without` or as a whole role that is `null` it is a `shape` error. moss prints these lines at boot, `nisc build` lists them after the route table, and `nisc dev` shows them on vite's error overlay each time a browser connects. `*` also matches across line breaks in an id.
- You are affected if: a charter has a string where a list belongs (`allow: '…'`, `deny: '…'`, `actions: '…'`, `data: '…'`, `extends: '…'`), or a misspelt key.
- What to do: write the string as a list (`allow: ['crm.deal.view*']`), fix every key the warnings name, and check the role grants what it should.

### A top-level `deny` beside an `actions:` section takes away when a role is resolved without verifying
- Before: `{ r: { actions: ['crm.*'], deny: ['crm.deal.delete'] } }` resolved through `resolveRole` or `resolvePrincipal` to everything under `crm.*`, `crm.deal.delete` included. `verifyCharter` refuses such a role (`ambiguous-selection`), so moss never boots it.
- Now: it resolves to everything under `crm.*` but `crm.deal.delete`, and a role that extends it loses `crm.deal.delete` too. A top-level `allow` beside an `actions:` section still grants nothing. `verifyCharter` refuses the role as before and also checks that `deny`, so it can report `dead-deny`, `orphan` or a re-allow warning for it.
- You are affected if: code calls `resolveRole` or `resolvePrincipal` on a charter it never passed through `verifyCharter`, with such a role. Under moss, nothing changes.
- What to do: run `verifyCharter`, and move the `deny` into the section: `actions: { allow: ['crm.*'], deny: ['crm.deal.delete'] }`.

### New, opt-in
- `RoleClosure.functions`: the functions a role is granted, listed in `verifyCharter`'s `perRole` when the functions universe is handed in.

## @niscorp/cli

### `nisc export --out <dir>` removes only the files its previous export wrote
- Before: `nisc export --out site` emptied `site/` (a `.git`, a notes file and all) and wrote the export. A link named with `--out` was replaced by a folder; a file at the `--out` path was replaced.
- Now: it removes only the files the previous export wrote there (recorded in `node_modules/.cache/nisc/exports.json`), then writes the new export. Everything else stays and is named, one line each run, including files an older export left before there was a record (a fresh CI checkout). A link named with `--out` is written into. A file at the `--out` path, or a folder of your own where the export writes a file, is refused with a sentence and nothing is written. `--out` pointing at the app, above it, or at the build is refused. The default `out/` is emptied and written as before, also when named `--out out` (and `--out OUT` on Windows and macOS).
- You are affected if: a script or CI step runs `nisc export --out <dir>` and expects the folder to contain only the export afterwards.
- What to do: empty the folder yourself before the export (keeping a `.git` if it is a deploy repository), or delete the files each run names.

### `nisc export` writes the whole export before it touches the folder
- Before: on Windows, a path from `paths()` such as `/a:b` emptied `out/`, wrote part of the site and died with a raw `ENOENT` stack (exit 1). A path such as `/z\..\..\escape` wrote a page outside the export's folder (with the default `out/`, into the app's own folder) and exited 0.
- Now: every export is first written whole into a fresh `.nisc-export-…` folder (for `out/`, in `node_modules/.cache/nisc/`; for `--out`, inside that folder). Only when every file was made is the export's folder touched. Both paths print `nisc: the path "/a:b" cannot be written here (ENOENT). Nothing was written.` and exit 1 with the folder as it was. A full disk prints `nisc: the export could not be written into <out> (ENOSPC on <file>). Nothing already in it was changed.` Which names fail is the system's answer: `/a:b` still writes `a:b/index.html` on Linux and macOS. A `.nisc-export-…` folder a killed export leaves is removed by the next one.
- You are affected if: on Windows, `paths()` returns a path with `\..\` or with `:`, `*`, `"`, `<`, `>` or `|`.
- What to do: nothing. If an export stops with `cannot be written here`, leave that path out of `paths()` or spell it as a folder name.

### `nisc start` compresses every answer as it streams
- Before: `nisc start` kept every compressed answer marked `immutable`, keyed by path and `last-modified` but not by query, and never forgot one. A route `/thumb` answering `cache-control: public, max-age=31536000, immutable` by `?user=` gave `/thumb?user=bob` the thumbnail made for `?user=alice`.
- Now: every answer is compressed as it streams. `/thumb?user=bob` gets Bob's thumbnail. A repeated `/assets/…` answer comes without `content-length` and costs the compression again (about 10 ms for a 0.6 MB bundle, once per new browser).
- You are affected if: a server route answers `immutable` text whose body depends on the query or the caller, or a client reads `content-length` on a repeated asset answer.
- What to do: nothing.

### The shape check reports other spellings of what a rule fails, and passes `<const>`
- Before: the shape check (`@niscorp/cli/shape`) matched spellings: `session.roles` failed rule 11 but `const { roles } = session` passed; `Intl.NumberFormat` failed rule 9 but `const { NumberFormat } = Intl` passed; `import { wordsOf } from '../app/helpers'` failed the `data` rule but `import * as helpers` passed. `<const>['a', 'b']` failed rule 16.
- Now: the same rules fail. A second reading prints one `[info]` line for each other spelling, such as `[info] rule 9: src/server/when.ts:1 Intl, the global one — another spelling of what the rule fails on; reported, not failed`. The exit code never changes because of these lines. A name read only as a type is not reported, nor one a rule already fails in that file, nor one `allow` names for that rule. `<const>[…]` passes rule 16, as `as const` does. The check takes a second or two longer on a large app.
- You are affected if: the app runs the shape check (`src/dev/shape-check.ts`); or its `allow.style` names a file only because of a `<const>` assertion.
- What to do: read the `[info]` lines and fix the reach or leave it. Delete an `allow.style` entry that now fails as "has nothing to allow". An `allow` entry added only to quiet an `[info]` line fails the same way.

## @niscorp/cortex

### A tool's `ctx.signal` aborts at the tool's time limit
- Before: a tool that passed its `timeoutMs` (30 s by default) was reported to the model as timed out, but its `ctx.signal` stayed live and its work ran on: a `send_email` that timed out and was called again sent the email twice. A delegated agent (`asTool`, `manifold.asTool`; 300 s by default) ran on after its limit. A later abort of the run reached work a tool left running after it returned.
- Now: at the limit, `ctx.signal` aborts with an `AbortError`; work handed that signal stops, and the email is sent once. A delegated agent stops at its delegation's limit. Each call has its own `ctx.signal`, which aborts with the run while the call runs; once the call has ended, a later abort of the run does not reach it. Gates and `onToolResult` hooks are still handed the run's signal. A tool that ignores `ctx.signal` runs on as before.
- You are affected if: a tool hands `ctx.signal` to work that can take longer than its `timeoutMs` (a build of several minutes, a long agent behind `asTool(`), or starts background work on `ctx.signal` and expects a later abort of the run to stop it.
- What to do: set `timeoutMs` on the tool (`defineTool({ …, timeoutMs })`, `asTool(agent, { timeoutMs })`) above the longest run you accept. Give background work a signal of its own and abort it yourself.

### `onToolResult` hooks run on errors too
- Before: a tool that threw `connect failed: postgres://admin:hunter2@db.internal/prod` sent that text to the model and to `tool-end`; a redacting hook `(o) => ({ result: '[redacted]' })` was not called.
- Now: hooks run after every executed call, also when the tool threw or passed its time limit. On an `error` observation a hook's `{ result }` replaces the error text: the model gets `error: [redacted]`, and `tool-end` carries `{ kind: 'error', error: '[redacted]' }`. A hook that throws makes the call an error with the hook's message. Hooks still do not run for a denied call, an unknown tool, or arguments that failed the input check.
- You are affected if: an `onToolResult` hook does not check `observation.kind`, or counts or logs calls.
- What to do: a hook meant for results only starts with `if (observation.kind !== 'result') return;`.

### A resumed run first runs the calls its last step left unanswered
- Before: a run aborted between two calls of one step (`c1` answered, `c2` not) left a transcript ending `assistant(c1, c2) tool[c1]`. `resumeRun` sent that to the provider and `c2` never ran: OpenAI refuses such a transcript; Groq takes it and the model goes on without `c2`'s result.
- Now: `resumeRun` runs `c2` first, through its gates, approvals and hooks, then calls the model. Any call of the last step with no tool message runs, so a call that was still running when the snapshot was taken runs a second time. A resume from a pending approval is unchanged.
- You are affected if: the app calls `resumeRun`, and takes `run.snapshot()` while a tool runs (inside the tool, or on an event before its `tool-end`).
- What to do: take the snapshot after the call's `tool-end`, or make the tool safe to run twice.

### `resumeRun` says what is wrong with a snapshot it cannot resume
- Before: a snapshot with no `messages` threw a `TypeError`; one whose `pending` had no `remaining` ran and ended `unknown`.
- Now: both throw from `resumeRun`: `[cortex:config] snapshot cannot be resumed: pending.remaining: …`. Every snapshot that resumed still does, `null` in optional fields included.
- You are affected if: code catches those old failures of a broken snapshot.
- What to do: nothing.

### A parent run's handle answers its delegated agent's approval
- Before: a delegated agent (`asTool(child)`, `manifold.asTool(id)`) whose gate asked for approval put `approval-required` on the parent's stream, but `run.approve(id)` on the parent's handle did nothing; the child waited until its delegation's time limit.
- Now: `run.approve(id)` or `run.deny(id)` on the parent, with the nested event's id, reaches the child at any depth. The child's own handle still works; the first answer counts. A nested approval does not survive a reload.
- You are affected if: the app answers approvals on the parent handle for events whose `agentPath` is deeper than the parent's.
- What to do: nothing. A tool that runs an agent itself passes its handle on:
  ```ts
  const handle = agent.run(input, { onEvent: ctx.forward, agentPath: ctx.agentPath, signal: ctx.signal });
  const stopForwarding = ctx.forwardApprovals?.(handle);
  const result = await handle.result.finally(() => stopForwarding?.());
  ```

### More agents stream `output-partial` events
- Before: an agent whose data schema has a constrained field (`.min(1)`, `.positive()`, an email or url format), a `z.record` or a `z.lazy` emitted no `output-partial` for the whole run. One with a field that takes any value (`z.record(z.string(), z.unknown())`, `z.any()`) stopped emitting at the first value nested inside it.
- Now: both stream partials to the end of the reply (one agent went from 0 to 27 events per answer). A union field whose value only a later variant takes is kept in the partials. As before, a partial can fail the schema until the run ends; the result is checked as before. A run handle keeps the extra events until it is dropped.
- You are affected if: an `output-partial` listener does work on each event (moves a live screen, sends a frame) for such a schema.
- What to do: nothing, unless the listener cannot take more events: then filter them.

### New, opt-in
- `output: { schema, refuseCutOff: true }`: a reply the provider cut off while its JSON was open (finish `length` or `content_filter`), or an attempt a Groq rejection carried cut short, is corrected (a `retry` event) instead of accepted closed at its last whole value.
- `ctx.forwardApprovals(handle)` for a tool that runs an agent itself (above).

## @niscorp/haptic

### `prepareArtifact` refuses a stamp entry that is no number
- Before: `prepareArtifact({ stamp: { 'nisc.haptic': 'v0', 'nisc.prism': 3 }, … })` read the `nisc.haptic` entry as current, ran none of its migrations, and prepared the artifact.
- Now: it throws `ArtifactError` with code `UPGRADE`: "The stamp's entry for nisc.haptic is \"v0\": not a number of migrations."
- You are affected if: the app prepares artifacts whose stamps it wrote by hand with entries that are not numbers. Stamps haptic writes are always numbers.
- What to do: write each stamp entry as a number of migrations.

## @niscorp/loom

### An optional field can be removed; a new Prism op starts with its required arguments only
- Before: an optional field (`email: z.string().email().optional()`) started as `""` with no way to leave it out. In a union branch, `toNova`'s `includeOptional: false` and `empty` were ignored. In the Prism plugin a newly chosen `$localeMoney` got `{ minorUnits: false, digits: 0 }` (4500 cents showed `€ 4.500`), `$localeDate` `{ hour12: false, timeZone: "" }` (a runtime error).
- Now: an optional field's `loom:field` node has `model` (the field's path) and `optional: true`; the kit shows **Remove** beside the label while the field has a value, and Remove writes it back to absent. `includeOptional` and `empty` apply in union branches. A newly chosen Prism op starts with its required arguments only (`$localeMoney: {}`, `$sortBy: { as: "" }`).
- You are affected if: a host kit registers its own `loom:field` (it gets the two new props and shows no Remove), or passes `includeOptional: false` or `empty` with unions.
- What to do: nothing. A custom `loom:field` can offer Remove by writing `undefined` through its `novaModel`.

### A union shows the branch the value is, or shows the value as JSON
- Before: a stored value no branch recognises (`kind: "triangle"`) was shown as the first branch, and an edit wrote that branch's fields into it. A structural union picked its branch by the first unique key, even an optional one. A union of `z.lazy` branches was a raw JSON box.
- Now: with no fallback branch the chooser shows "—" and the value is in the JSON editor until a branch is chosen. A key the branch requires is preferred. Lazy branches form a union with a chooser.
- You are affected if: the host reads `parse`'s `Field` model, or opens forms on values no branch matches.
- What to do: nothing.

### A literal starts as its value
- Before: `z.literal("circle")` parsed as `unknown` (a raw box starting at `null`); a union of literal-tagged objects started as `{ kind: null, radius: 0 }`.
- Now: it is `{ kind: "enum", options, default }`, a select starting at `"circle"`; that union starts as `{ kind: "circle", radius: 0 }`.
- You are affected if: the host reads the `Field` model.
- What to do: nothing.

### Clearing a number leaves it absent unless the schema takes `null`
- Before: emptying a number box wrote `{ "qty": null }`, which `z.number().optional()` refused.
- Now: the key is absent; `null` only where the schema is `.nullable()`. `FieldMeta` gains `nullable?: true`; `loom:number` gets `nullable` and `integer` props and steps by 1 for an integer.
- You are affected if: the host saves on change and reads `null` as "no number".
- What to do: read a missing key as "no number".

### A select with no value shows "—"
- Before: a required enum with no value displayed its first option, and choosing it wrote nothing.
- Now: a disabled "—" row shows until an option is chosen; every option is a change and is written. Documents are unchanged.
- You are affected if: a test reads the select's displayed value.
- What to do: update the test (an empty select now reads `''`).

### An object with a dotted key is edited as JSON
- Before: `{ "a.b": string }` bound `$.a.b`: the control showed nothing and an edit wrote `{ a: { b: … } }`.
- Now: such an object is the raw JSON box at its own path, and an edit writes `{ "a.b": … }`; the editor wraps such a root document.
- You are affected if: a schema has a key with a dot in it, and the host calls `toNova` directly.
- What to do: with `toNova` at the root, pass `rootKey`.

### New, opt-in
- CSS variables for the kit's and reference plugins' colours (`--loom-border`, `--loom-danger` and 23 more, listed in the README); each falls back to today's colour.

## @niscorp/moss

### An update that moves a row out of the caller's update rule is refused
- Before: an update through `/api/vex` or `executeAs` that wrote a column the caller's update rule pins (`owner_id` under an `owner_id = me` rule, `project_id` under `match: 'project_id'`) to a value the rule does not allow wrote it, and the row left the caller's reach.
- Now: it is refused with 400 `scope_denied`, naming the rule and the column, and nothing is written (one check query first). A column a `set` rule stamps is not checked. An insert's `onConflict … set` that would move a row leaves it as it is and answers `[]` for it.
- You are affected if: an update or upsert entry writes a column that the table's write or update behavior pins with `match:`, to a value outside it: handing a record to someone else, moving it to another project or account.
- What to do: if the app means it, set `runtime.checkMovedRows: false`.

### The webhook door and the integration proxy keep the app's session out
- Before: a webhook (`POST /integrations/:id/hook/*`) passed the visitor's `cookie`, `proxy-authorization` and `x-operator-key` on to the integration, and a page the integration answered was served as the app's own page.
- Now: those headers stay behind. What an integration answers, through a webhook or the proxy, is served with `x-content-type-options: nosniff` and `content-security-policy: sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation`. A vendor page a browser lands on (an OAuth `form_post` callback, a SAML POST) still runs its script, submits its forms and moves the window on, but with no origin: it cannot read the app's cookies or browser storage, a socket it opens is refused, and a form it posts into the app carries no session cookie. A `fetch` that reads the answer is not affected.
- You are affected if: an integration's service reads `cookie`, `proxy-authorization` or `x-operator-key` on a hook request, or a vendor page served through the door uses the app's cookies or storage, or posts into the app expecting the visitor to be signed in.
- What to do: carry what the integration needs in the request itself (a signed `state` value), not in the app's session.

### `session.answerIntent` replays an entry at the reach it declares
- Before: a replay through `session.answerIntent` of an entry that declares a `reach` ran under the caller's own policy, wider than the entry asks.
- Now: it runs at that reach, as `/api/vex` answers the same person: fewer rows, or `scope_denied` for a role with no such reach.
- You are affected if: the app calls `session.answerIntent` and its entries declare `reach`.
- What to do: nothing.

### A revoked session's socket closes within one revalidation interval
- Before: every `sessionRevalidateMs` a pass asked the `session` verifier about one socket at a time. With 200 sockets, a 20 ms verifier and `sessionRevalidateMs: 500`, a revoked socket stayed open about 6.7 s.
- Now: a pass asks once for each distinct token, every token at the same moment, and the revoked socket closes after about 520 ms. Sockets that present one token share one call. Where a pass took longer than the interval, the verifier now sees more calls, all at once at the start of the pass (in the example, about 28 a second become about 350 a second, up to 200 at once). With `session: 'sessions'` each pass, every 60 s by default, sends one query per distinct token at once. The log line for a late failure now reads "could not be asked about a token after its pass went on. Its connections stay open and are asked again".
- You are affected if: the app has many signed-in sockets on `session: 'sessions'`, or a `runtime.session` function that calls a service with a limit on calls at once.
- What to do: small apps, nothing. With many sockets, watch request latency around each pass and raise `sessionRevalidateMs` or the pool size if it shows. A verifier of your own with a limit queues inside itself (a small semaphore around the service call).

### New, opt-in
- `runtime.answerReadableRows: true`: a write on the `/api/vex` surfaces answers only the rows the caller may read. Off by default: with it on, a sign-in entry that deletes a one-time link and reads who signs in from the deleted row, run by a role with no read grant on the link table, answers `[]`.
- `runtime.artifactsUnusedSinceStart: true`: the artifact sweep counts unused time only since the server started. By default, time the app is down counts as unused, so after a downtime longer than `artifactsUnusedMs` the sweep at boot deletes everything not used since.

## @niscorp/nisc

### The rulebook
- Before: `AGENTS.md` was written as long paragraphs and also carried the part for whoever changes a package.
- Now: `AGENTS.md` reads as short numbered points; the part for whoever changes a package is `CHANGING_A_PACKAGE.md`, beside it. Rule 16 names `<const>` beside `as const` as the one assertion allowed. This guide ships as `UPGRADING.md`.
- You are affected if: an app's own `AGENTS.md` quotes the rulebook rather than pointing to it.
- What to do: nothing; an app made by `npm create nisc` points to it.

## @niscorp/nova

### A mount hook's navigation acts from its own instance
- Before: an action `opener` with `lifecycle: { mount: [{ push: { action: 'child' } }] }`, pushed over `home`, ended `home:suspended > child:active > opener:active`. `mount: [{ removeSelf: true }]` did nothing, and `mount: [{ pop: true }]` closed `home`. Push a dialog over an action whose `suspend` hook takes 30 ms, pop it 1 ms later, and the action stayed `suspended` on top, its buttons dead.
- Now: the opener ends `home:suspended > opener:suspended > child:active`; `removeSelf` and `pop` close the opener and leave `home:active`. The action revealed by the pop ends `active`. `getState` and `getCanvasState` list a new instance while its mount hook runs, so a data-change listener sees the instance's first writes (the input merged at mount) on its canvas; and the first `onStateChange` snapshot after a mount hook pushes onto another canvas already shows the new instance.
- You are affected if: a `mount` hook navigates before its first `call` returns; or a `shell.onDataChange` listener looks an instance up in `getState()` and counts or reacts to its writes (it now sees one write more, the one at mount); or a listener reads the very first snapshot after a push.
- What to do: a listener that counts writes skips the write equal to the data the instance was placed with. Otherwise nothing.

### A field with a `ref` inside a loop writes its own row
- Before: `{ for: '$.lines', as: 'line', do: { component: 'Input', ref: 'qty', model: '$line.qty' } }` over three rows gave every field the model ref `qty`; typing 5 into the first row wrote the last: `[{qty:1},{qty:1},{qty:5}]`.
- Now: each row's model ref is `qty@lines.0.qty`, `qty@lines.1.qty`, …; typing 5 into the first row gives `[{qty:5},{qty:1},{qty:1}]`. The node's `ref` stays `qty`: `data-ref`, triggers on `ref: 'qty'` and `@event.ref` are as before. The longer name shows in the TTY command list and moss's terminal render trees (`set qty@lines.0.qty …`).
- You are affected if: code compares a loop field's `model.ref` with its written `ref`, or a terminal script types `set qty …` for such a field.
- What to do: compare the node's `ref` instead; type the longer name in terminal scripts. A kit that dispatches `ui:model` with the node's `model.ref` keeps working.

### Inside a loop, `model: '$.<as>.x'` writes the row it shows
- Before: in `{ for: '$.lines', as: 'line', do: { component: 'Input', model: '$.line.qty' } }` the field showed the row's `qty` but typing wrote a root `line.qty`. `model: '$.index'` wrote a root `index`. A nested `for: '$.g.items'` inside `for: '$.groups', as: 'g'` bound `g.items.0.v` in every group.
- Now: `model: '$.line.qty'` writes `lines.0.qty`; `model: '$.index'` binds nothing, as `model: '$index'` does; the nested loop binds `groups.0.items.0.v`, `groups.1.items.0.v`. What every layout shows is unchanged.
- You are affected if: a layout inside a loop writes through `model: '$.<as>…'`, `'$.items'` or `'$.index'`.
- What to do: nothing.

### `model` and `for` written as one `{{…}}` bind
- Before: `model: '{{$.q}}'` bound nothing, so typing changed nothing; inside `for: '{{$.lines}}'` every `model` lost its binding.
- Now: both bind as the bare path does (`model: '$.q'`, `for: '$.lines'`), and typing writes the data.
- You are affected if: a layout (one a model wrote, say) uses that form.
- What to do: nothing.

### Bindings never read what every object inherits
- Before: `{{$.x.constructor}}` rendered `function Object() { [native code] }`, and `$toString` read a function.
- Now: `$.x.constructor`, `$.x.toString` and `$.x.__proto__` are `undefined` (the text renders empty). A name every object inherits (`toString`, `constructor`, `valueOf`) is never found as an action, fragment, endpoint, function, phrase, slot or directive. A `functions` object made with `Object.create({ hello })` or as a class instance still finds `hello`; a getter on a class the data carries still reads.
- You are affected if: a layout reads one of `Object.prototype`'s members through a binding.
- What to do: put the value in the data.

### A fragment's slot renders the stored layout its action names
- Before: an action with `layout: 'invoice-body'` (an id in the layout store), pushed with a fragment whose layout has `{ slot: 'body' }`, showed the text `invoice-body` in the slot.
- Now: the slot shows the stored layout.
- You are affected if: an action with a string `layout` is pushed `with` a fragment.
- What to do: nothing.

### The DOM and TTY kits register `CanvasSlot`
- Before: `createShell({ canvases: [{ id: 'main', initial: 'hello' }], registry: ttyKit() })`, as the README shows, drew `!! COMPONENT_NOT_FOUND: … CanvasSlot`.
- Now: the default shell layout draws, and `defaultRegistry().list()` of these kits names `CanvasSlot`, as the React and Vue kits' lists do.
- You are affected if: code builds a component list (for a model, say) from the DOM or TTY kit's `registry.list()`.
- What to do: nothing.

### `NovaShell` adds only the React components a registry lacks
- Before: `<NovaShell shell={shell} registry={registry} />` with a registry that had no `CanvasSlot` registered all nine default React components on it, replacing the registry's own `Text`, `Stack`, `Input`, `Button`, `Box`, `Panel`, `JsonTree` and `ActionSlot`. `NovaCanvas` did the same.
- Now: only the names the registry does not have are added; its own components stay. A registry that has `CanvasSlot` is untouched, as before.
- You are affected if: the app hands `NovaShell` or `NovaCanvas` a registry with its own versions of those names and no `CanvasSlot`: it now sees its own components.
- What to do: nothing, unless the app wants React's defaults over its own: then call `registerNovaReactComponents(registry)` itself.

### A `$` name followed by more words is text
- Before: any string starting with `$` and a letter was read as a path: `children: '$CAD only'` rendered empty. `{ if: '$count > 0', then: THEN, else: ELSE }` with `count: 0` rendered ELSE (a path that does not exist).
- Now: `'$CAD only'` renders `$CAD only`, and with a phrasebook it is looked up and reported to `onPhraseMiss` when missing. That condition renders THEN (the string is text, which is truthy); the same for a step `{ $if: '$count > 0', … }`. `'$'` alone, `'$USD'`, `'$item.größe'` and `'$item.name '` resolve as before.
- You are affected if: a layout has such text, or a condition written as a `$` name and more words.
- What to do: write a comparison with `{ $prism: … }`; add a translation where the phrasebook reports one.

### A plain-text HTTP error body reaches `errorTarget.data`
- Before: an endpoint with `errorTarget: 'err'` whose server answered `503` with `Service down for maintenance` wrote `err = { status: 503, message: 'HTTP 503' }`.
- Now: `err = { status: 503, message: 'HTTP 503', data: 'Service down for maintenance' }`, and `@error.data` carries the text. A JSON error body is read as before. `FetchResponse` gains an optional `clone`; a fetch whose responses lack it is read as before.
- You are affected if: a layout or step shows the whole error object.
- What to do: nothing.

### A failure that comes back after a newer call came back is dropped
- Before: search "a" (fails after 50 ms), then "ab" (succeeds after 5 ms), on an endpoint with `target: 'rows'` and `errorTarget: 'err'`: the rows showed "ab", then the late failure wrote `err` over a screen that was fine.
- Now: `err` stays as it was. The failed call's `onError` steps still run. A failure that comes back while a newer call is still on its way is written, as before.
- You are affected if: an endpoint with `errorTarget` is called again before an earlier call failed (search as you type, repeated saves).
- What to do: nothing.

### Translations go in as written
- Before: on text with spaces around it (`'Price in dollars '`), a translation `'Preis in US$$'` rendered `Preis in US$ `: `$$`, `$&`, `` $` ``, `$'` and `$1` were read as patterns.
- Now: it renders `Preis in US$$ `, as on text without spaces.
- You are affected if: a translation contains one of those sequences.
- What to do: write the text you want shown.

### `onError` is told of more problems
- Before: these reached no one: in a strict shell (`strict: true`), a `call` that failed with no `onError` steps and no `errorTarget`, a call to an endpoint the action lacks (`{ call: 'svae' }`), and a subscriber that threw (`onStateChange`, `onDataChange`, `onEndpoint` listeners, handlers on the shell's own buses, a runtime's data and status subscribers); in any shell, a `removeAt` whose template index resolved to a negative number (`index: '{{$.found}}'` with `found = -1` removed the last row without a word), a `GET` endpoint with a `request` body, and an actions or fragments map keyed by something other than the id.
- Now: each is reported to `onError` as a `NovaError`: `ENDPOINT_FAILED` (`endpoint 'save' failed: disk full`, `unknown endpoint: svae`) and `HANDLER_FAILED` (the thrown message) in strict shells; `MUTATION_ERROR` for the negative index, which is still applied; `DefinitionValidationError` for the `GET` with a body. What runs is unchanged: nothing new is thrown, and an `onError` that throws stops nothing. `ErrorCodes` gains `endpointFailed` and `handlerFailed`, and `ErrorCode` gains `'ENDPOINT_FAILED'` and `'HANDLER_FAILED'`. A literal `index: -1` is not reported. Lax shells report no failed call and no throwing subscriber, as before; buses the app hands in are left as they are.
- You are affected if: `onError` logs or shows errors, or switches exhaustively over `ErrorCode`; or a `removeAt` template index can be negative.
- What to do: handle the two new codes. Guard a `removeAt` whose index can be "not found" with `$if`.

### New, opt-in
- `replaceDraftOnWrite: true` on a bound `Input`: while it is focused, a change at its model path that is not its own echo replaces what is typed (DOM, React, Vue and Ink adapters).

## @niscorp/prism

### `$update` and `$has` read a path as `$get` does
- Before: `$update` of `{ items: [{qty:1},{qty:2}] }` at `["items","0","qty"]` gave `{ items: { "0": { qty: 5 } } }`, losing item 2. At `["items","5"]` over `[1, 2]` it gave `{ items: { "5": 5 } }`. Of `{ title: "Hello" }` at `["title","en"]` it gave `{ title: { en: "Hi" } }`. `$has` at `["items","0"]` over a list answered `false`.
- Now: the first gives `{ items: [{qty:5},{qty:2}] }`; the second is `E_MISSING_PATH` ("No array item at items.5"); the third is `E_TYPE`; `$has` answers `true`. A key on a list (`"x"`, `"01"`) or on a string, number or boolean is `E_TYPE`. A missing key or `null` on the path is still created as an object.
- You are affected if: an `$update` path runs through a list by digit text or through a scalar (in a strata document step too: documents upgraded after the release get the new shape or the error).
- What to do: write the object you want with `$merge`, or test the value first with `$type`.

### `$round` rounds at the decimals as written
- Before: with `digits: 2`, `1.1` `"ceil"` gave `1.11`, `4.35` `"floor"` `4.34`, `1.005` `1`, `0.285` `0.28`; `digits: 400` gave `NaN`.
- Now: `1.1`, `4.35`, `1.01`, `0.29`; more digits than a number has give the number. `digits: 0` answers as before.
- You are affected if: `$round` with `digits` above 0 meets a value whose decimals end on a half or exactly on the cut: it can now differ by one in the last place.
- What to do: nothing, unless a stored number must match one rounded before; stored numbers keep their value.

### An overflowing sum, difference, product or quotient is an error
- Before: `{ "$mul": [1e308, 10] }` gave `Infinity`, which JSON stores as `null`.
- Now: `E_TYPE`, "$mul gave Infinity, which is not a JSON number." The same for `$add`, `$sub`, `$div`, and for `$sum` and `$avg`.
- You are affected if: arithmetic runs on numbers a person types with no bound.
- What to do: refuse an unbounded typed number before the arithmetic (`$lt` against a ceiling), or let the error reach the form.

### `$localeMoney` takes the divisor from the currency; the locale ops read the amount as `$toNumber` does
- Before: 1500 JPY with locale `en_US` (a tag Intl cannot read) printed `JPY 15.00`. An amount of `[1999]` printed `19,99 €`, `true` `0,01 €`, `"0x10"` `0,16 €`, `"   "` `0,00 €`, in `$localeMoney` and `$localeNumber`.
- Now: `JPY 1500`. Those four amounts are `E_TYPE`. `" 1999 "` is still read; `null` and `""` still go to `fallback`.
- You are affected if: the amount can be a list, a boolean, hex text or blank text.
- What to do: hand a number or numeric text.

### Options Intl refuses are a `PrismError` with `E_SCHEMA`
- Before: `$localeDate` with `{ dateStyle, weekday }`, or `$localeNumber` with `minDigits: 2, digits: 1`, threw a bare `TypeError` or `RangeError`.
- Now: a `PrismError`, code `E_SCHEMA`: "$localeDate: Intl refused its options: …".
- You are affected if: code catches `RangeError` or `TypeError` by class around prism.
- What to do: catch `PrismError`, or read `code`.

### `$min` and `$max` skip `null` wherever it is
- Before: `$min` of `[3, null, 1]` was `E_TYPE`; of `[null, 3, 1]` it was `1`. Each item cost 8 steps.
- Now: both `1`; a list of nulls gives `null`. Each item costs 9 steps, so a list of about 111,000 items or more under the default `maxSteps` (1,000,000) is refused with `E_BUDGET`. The compiled `fingerprint` of a config using them changes once (vex re-seeds such a cached entry once at boot).
- You are affected if: a list can have `null` after its first item, or has more than about 110,000 items.
- What to do: for very long lists, raise `maxSteps`.

### `$replace` writes its replacement as given
- Before: replacement `"US$$5"` wrote `US$5`; `"[$&]"` wrote the matched text in brackets.
- Now: `US$$5` and `[$&]`, as typed.
- You are affected if: a replacement contains `$$`, `$&`, `` $` `` or `$'`.
- What to do: write the text you want (`"US$5"`).

### Text is never cut inside a character
- Before: `$slice` 0–5 of `"Hey 👍 there"` gave `"Hey \ud83d"`, half a character that Postgres jsonb refuses; `$take 1` of `"👍"` gave `"\ud83d"`; `$split` of `"a👍"` with `sep: ""` gave three items.
- Now: `"Hey "`, `""`, `["a", "👍"]`. Every result that was whole text is the same. `$length` still counts UTF-16 units.
- You are affected if: text that may contain emoji is cut at a fixed length: it is one character shorter where an emoji straddles the cut.
- What to do: nothing.

### `$interpolate` fills names in any script
- Before: `"Hallo {{straße}}"` stayed as written, even with `straße` in `values`.
- Now: `"Hallo A"`, or `"Hallo "` when the key is missing, as an ASCII name always did. `{{first-name}}` and `{{ name }}` are still left as written.
- You are affected if: a template has a `{{…}}` name that is not ASCII (owner-written mail templates, say): where the key is missing it becomes empty text instead of staying in braces.
- What to do: nothing.

### Date and locale ops are answered where they run
- Before: `compile` (and a kept `evaluate` from its second call) worked out `$date`, `$dateAdd`, `$dateDiff`, `$localeDate`, `$localeMoney` and `$localeNumber` whose inputs were all written: `{"$date":{"value":"2026-01-01T09:00:00Z","format":"HH:mm"}}` compiled in Vienna was stored as `{"$const":"10:00"}`, and `execute` in Los Angeles answered `10:00`.
- Now: these ops stay ops in a compiled IR and answer on the machine that runs them (`01:00` there). On the compiling machine every answer is the same. The `fingerprint` and `meta.stats.optimizations.constantsFolded` of such a config change once; each call spends one more step and one Intl format per such op. An IR stored before keeps its folded constant until compiled again.
- You are affected if: code compares stored fingerprints or `constantsFolded`, or runs IRs compiled on another machine.
- What to do: recompile stored IRs that should answer where they run.

### A kept config answers the same on every call
- Before: a config object run again by `evaluate` worked out its written parts from the second call, each counting one step: a `$join` of 600 written parts under `maxSteps: 500` failed on call one and passed from call two. A `$const` with a `__proto__` key kept it on the first call and lost it from the second (`out.admin` read `true` through the prototype).
- Now: every call answers as the first. `compile` and `execute` are unchanged.
- You are affected if: a kept config's first call is near `maxSteps`, or a constant has a `__proto__` key.
- What to do: nothing.

<!-- P7 -->
### An impossible ISO date is `E_DATE_INVALID`
- Before: `"2026-02-30"` was read as 2026-03-02, `"2026-13-01"` as 2027-01-01, `"2026-02-29"` as 2026-03-01, `"…T10:00:60"` as 10:01; `$dateDiff` from `2026-02-28` to `2026-02-30` gave 2.
- Now: `$date`, `$dateAdd`, `$dateDiff` and `$localeDate` refuse each with `E_DATE_INVALID`. `"…T24:00:00"` is still the next midnight, and text that is not ISO (`"3/4/26"`, RFC 2822) is read as before. A date built from parts fails where it does not exist: this year joined to a stored `02-29` gives `2027-02-29`, which fails on every day of a common year. Inside `$map`, one failing item fails the whole list: an entry that lists everyone's next birthday answers an error for everyone, and the screen that reads it shows nothing. In a strata document step, the document's upgrade stops with the error.
- You are affected if: a config passes `$date`, `$dateAdd`, `$dateDiff` or `$localeDate` a date built by `$join`, `$interpolate` or `$fill`, above all a year joined to a stored month and day.
- What to do: build the date so it exists: when the year is not a leap year, use 28 February or 1 March for a 29 February (a `$case` on the joined text before `$dateAdd`).

### New, opt-in
- `EvalContext.folding?: boolean`, set while the optimizer works a subtree out ahead of time; an op written against `EvalContext` can ignore it.

## @niscorp/signal

### A Groq tool call cut inside its arguments is not run
- Before: Groq rejected a call with `tool_use_failed` and the attempt `{"name":"transfer","arguments":{"to":"acct-1","amount":10` (the model was writing 1000). signal closed it and ran `transfer({ to: "acct-1", amount: 10 })`.
- Now: the arguments go on as the text they are, the tool's input check fails, the model is told `error: input_invalid: …` and calls again. An attempt whose arguments are whole runs as before.
- You are affected if: the app runs tools on Groq through signal or cortex: the rare turn where Groq cuts inside the arguments costs one more model call.
- What to do: nothing.

### Two tool calls streamed at one index stay two calls
- Before: a provider stream that sent `add {"a":1}` and `mul {"b":2}` both at index 0 gave one call `mul` with `{"a":1}{"b":2}`; `tool_call_delta` events read `a@0, b@0, c@1`.
- Now: two calls; a piece with a new id at an index another call has starts a new call under the next free index: `a@0, b@1, c@2`. OpenAI, Groq, OpenRouter and the Responses adapter send one id per index and see no change.
- You are affected if: code reads `tool_call_delta.index` from a provider that repeats indices.
- What to do: nothing.

### With no schema, a rejected reply nothing was recovered from throws
- Before: `createSignal('groq').tools([lookup]).complete('x')`, where Groq rejected a call to an undeclared tool, resolved with `response: ''`.
- Now: it rejects with `SignalError` `E_PROVIDER_ERROR` ("Provider rejected the reply: …", the provider's error in `context.raw`); `stream()` throws the same from its iteration. With a schema nothing changes.
- You are affected if: code calls `complete()` or `stream()` without `.schema()` and treats `''` as an answer.
- What to do: catch `E_PROVIDER_ERROR` there.

### `.apiKey()` overrides a custom provider's own key
- Before: `createSignal({ baseUrl, apiKey: 'provider-key', model }).apiKey('override-key')` sent `Authorization: Bearer provider-key`.
- Now: it sends `Bearer override-key`. Without `.apiKey()`, the provider's own key is sent as before.
- You are affected if: code calls `.apiKey()` on a custom provider that has its own key.
- What to do: remove the override if it was there by mistake.

### An `AbortSignal` aborts every call
- Before: a signal set with `.options({ signal })` was not read by every call. An aborted `stream()` threw "stream ended without a done event". An abort waited out a rate limit's `retry-after`.
- Now: `complete()`, `stream()`, `step()`, `stepStream()`, `embed()` and `decide()` read it, and `step()` takes `{ signal }` as its second argument. An aborted `stream()` ends without a `done` event and without throwing; `complete()`, `step()`, `embed()` and `decide()` reject with `E_PROVIDER_ERROR`; a call aborted before it starts sends nothing. `stream()`, `stepStream()` and `complete()` end at once during a `retry-after` wait.
- You are affected if: code detects an abort of `stream()` by catching that error.
- What to do: check `signal.aborted` after the loop.

### New, opt-in
- `meta.finishReason` on every `complete()` and `stream()` result (`stop`, `length`, `content_filter`, `tool_calls`, or signal's own `error_recovered`), and `wire.truncated: true` on a `step()` or `stepStream()` result rescued from a cut reply. Code that compares a whole `meta` or `wire` object for equality sees the new fields.
- `createSignal(provider, { refuseCutOff: true })`, or `output.refuseCutOff` on `step()`: a reply cut off while its JSON was open is a failed attempt and is retried, instead of accepted as far as it was written.
- `step()` returns `reasoning` when a non-streaming reply carries the model's thinking.

## @niscorp/solid

### A stream ends once
- Before: in `strict` mode, `{"title":"Hi","items":["a"` then `,2]` failed the stream, but `select('items').final()` awaited before the failure never settled, and `select('count').final()` asked after it resolved with the starting value 0. Prose after a valid reply made a second `final()` reject. `{"":{"x":1},"b":2}` resolved `final()` at the inner `}`, without `b`.
- Now: both selections reject with `[solid] stream failed validation`; a selection that resolved before the failure keeps its value; `final()` keeps the value it resolved with; that reply resolves at the last `}`, with `b`.
- You are affected if: strict-mode code awaits selections.
- What to do: handle the rejection of a selection's `final()`, as for the root's.

### Fields that take any value keep their contents; string formats take only strings
- Before: below `z.any()`, `z.unknown()` or an intersection, everything was refused as `<unknown path>`: `x: z.any()` given `{"x":{"b":[1,2]}}` ended `{ x: {} }` with an error, and a recursive `z.lazy` schema kept nothing. `to: z.email()` given `{"to":[1]}` gave `{ to: [] }`.
- Now: `{ x: { b: [1, 2] } }` with no error; a recursive schema keeps every level. `{"to":[1]}` is skipped with an error in `recover`, and fails the stream in `strict`.
- You are affected if: a strict stream can get a non-string for `z.email()`, `z.url()`, `z.uuid()` or `z.iso.*`.
- What to do: expect the rejection.

### No `initial` needed for schemas like `.min(1)`
- Before: `createStream({ schema })` without `initial` threw `[solid] cannot derive valid base…` for `.min(1)`, `.positive()`, `array().min(1)`, an email, url or uuid format, a `z.record` or a `z.lazy`; a root of `z.any()` or a `.nullable()` object made `write('{…')` throw a `TypeError`.
- Now: the derived starting value is used. A `strict` stream started so checks the value `final()` would resolve with against the whole schema: `{"t":""}` for `.min(1)` rejects `final()` (`onError` phase `finalize`). In `recover` mode, without `constraints: 'finalize'`, `final()` can resolve with a value the schema refuses.
- You are affected if: code relied on the construction error.
- What to do: nothing.

### A union's field is checked against every variant
- Before: with `w: z.discriminatedUnion('kind', [{ kind: 'text', value: z.string() }, { kind: 'count', value: z.number() }])`, `{"w":{"kind":"count","value":5}}` lost the 5 in `recover` and failed a valid reply in `strict`.
- Now: `{ w: { kind: 'count', value: 5 } }`. An object a union decides must fit one variant when it closes: `{"w":{"kind":"text","value":5}}` still fails a strict stream, and in `recover` it is reported (`onError`, `expected: 'a variant of the union'`) with the value left in `current()`.
- You are affected if: a union's variants type one field differently, or an `onError` listener in `recover` mode.
- What to do: nothing.

### Only JSON numbers are read as numbers
- Before: `{"a":Infinity,"b":0x1F,"c":+5,"d":.5}` put `Infinity`, 1, 5 and 0.5 into `current()`.
- Now: such text is dropped with no error, and each field keeps what it had. Valid JSON reads as before.
- You are affected if: the input is not JSON.
- What to do: nothing.

## @niscorp/strata

### A stamp entry that is no number is refused; rows strata cannot read are named
- Before: `upgrader.upgrade(doc, { kind, stamp: { 'acme.kit': 'v0' } })` returned the document unmigrated, stamped current. `upgradeStore` skipped a row stamped `{"acme.kit":"five"}` without a word, and read a stamp column of type `text` as "no stamp", so every migration ran again over documents already through them.
- Now: an entry that reads as no number makes `upgrade` and `behind` throw `StrataError` `INVALID_SEQUENCE` ("The stamp's entry for acme.kit is \"v0\": not a number of migrations."). Digits in a string and `null` read as before. `upgradeStore` leaves rows it cannot read as they are and names them in a new `unread` field of its report (`unread: ['id="e"']`, present only when there is one): such an entry, a stamp that is neither null nor a JSON object, or a key the driver does not hand back as stored (a `timestamptz` with microseconds). It loads only the documents of rows that are behind. Under moss, an integration bundle with such an entry is refused at intake.
- You are affected if: the app calls `upgrade` or `upgradeStore` itself with stamps it wrote by hand, keeps stamps in a `text` column, or compares the whole `upgradeStore` report.
- What to do: nothing for stamps strata wrote. Change a `text` stamp column to `jsonb` in an appended migration of your own sequence.

### `strata upgrade` replaces and removes only its own files; `verify` trusts the lock
- Before: `strata upgrade` with `workDir: '.'` replaced a `REPORT.md` or `plan.json` already there, and `verify` deleted it. `verify` took `from` and the untouched artifacts from `plan.json`, so an edited plan could move the lock with the source never migrated. Grammars passed in another order refused a valid plan. Two ids that clean to one file name (`a/b`, `a_b`) shared one expected file.
- Now: in a `workDir` the host names, `REPORT.md` is strata's only when it begins with `# strata upgrade`, and `plan.json` only when it has a plan's shape; otherwise `upgrade` exits 1 with "REPORT.md is not one strata wrote — it is left as it is. Move it, or give strata a workDir of its own." The default `.strata/upgrade` is replaced as before. `verify` refuses a plan whose `from` is not the committed `strata.lock.json` ("… plan again"), and fails when an edited artifact does not pass its kind's current schema. Stamps are compared grammar by grammar. The second id gets `a_b~2.json`.
- You are affected if: `strata upgrade` runs with a `workDir` that has files of your own with those names, or someone edits `plan.json` by hand.
- What to do: give strata a work folder of its own (or the default); re-run `strata upgrade` instead of editing `plan.json`.

## @niscorp/tide

### A manual fact runs only a reflex of its own identity; a run fact cannot be ingested
- Before: `tide.ingest({ kind: 'manual', target: 'b.refund', payload: { amount: 99999 }, at }, { as: 'tenant-a' })` ran tenant B's reflex `b.refund`, even disabled, with tenant A's payload. `ingest` stored a `kind: 'run'` fact and woke that identity's `on: { fact: { run: … } }` reflexes.
- Now: a manual fact reaches only a reflex with the same `as` (no `as` reaches only reflexes with none). A run fact throws `TideError` `invalid_fact`: tide writes one when a run settles.
- You are affected if: the host calls `ingest` with `kind: 'manual'` and an `as` other than the target reflex's, or with `kind: 'run'`.
- What to do: aim at a reflex with `fire(reflexId, { now, input, by })`, which runs it under its own identity, disabled or not.

### A run whose fan-out failed waits before it is tried again
- Before: a run whose fan-out threw in a host seam (`select` throws `ECONNREFUSED`, a template breaks) stayed `pending` and was tried again on the next `advance`, oldest first: three such runs and `limit: 3` filled every pass, and a healthy run behind them never fanned out.
- Now: it stays `pending` and is tried again after a wait from the reflex's own `policy.retry`: `baseMs · 2^(min(n, max) − 1)` with `backoff: 'exponential'` (the default), `baseMs` with `'fixed'`; with the defaults, 60 s, 120 s, 240 s, then 240 s each time. The runs behind it fan out meanwhile. Waits are kept in each engine's memory: after a restart a deferred run is tried once at once. A large `retry.max` makes a long wait (`max: 20` waits 364 days).
- You are affected if: a reflex's selection or transform can fail for a moment (a database restart): its run fans out after the wait, not on the next advance.
- What to do: nothing. A reflex that must retry sooner sets `policy: { retry: { baseMs: 5_000 } }`.

### The Postgres store mints UUID ids
- Before: new `fact`, `run` and `task` rows got ids like `fact_mwi60d3d_1`. Two processes on one database could mint the same id in the same millisecond, and the second write failed (`duplicate key value violates unique constraint "tide_fact_pkey"`).
- Now: new rows get a UUID. Rows already written keep their ids; nothing migrates. The memory store keeps `fact_1`-style ids. Runs opened in one advance share one `created_at`, and UUIDs break that tie at random.
- You are affected if: code parses tide ids, or a list sorts tide rows by `created_at` and breaks ties on `id`.
- What to do: break ties on `due_at`, then `id`.

### The driver renews a task's lease just before its effect
- Before: a task late in a slow pass, whose lease had run out and which another instance had claimed again, could run twice.
- Now: `advance` takes an optional `clock`, and the driver passes its own. Each task's lease starts again just before its effect, and the effect runs only if the task is still this claim's. That is one more write per task.
- You are affected if: the app runs tide through the driver.
- What to do: nothing.

### The memory store claims serial tasks first
- Before: with limit 1, a task of a parallel reflex ordered first and a task of an `order: 'serial'` reflex second, `createMemoryStore().claim` took the parallel one; the Postgres store took the serial one.
- Now: both claim the serial one.
- You are affected if: tests on `createMemoryStore()` with `order: 'serial'` hit the claim limit. A store of your own should do the same.
- What to do: assert what the Postgres store does.

### Daylight-saving times resolve as documented in +12 and +13 zones
- Before: in Pacific/Auckland and Antarctica/McMurdo, a daily 02:00 on the spring-forward day fired at 01:00, and in the repeated hour the second occurrence was taken. In Pacific/Chatham, the times 02:00–02:30 on both transition days fired an hour off too.
- Now: they fire as in every other zone: an erased time past the gap by its length, a repeated time at its first occurrence. Occurrence keys do not change, so no run is opened twice or lost.
- You are affected if: a clock reflex runs in one of those three zones inside the transition hour.
- What to do: nothing.

### The reflex agent sends back a draft whose one-shot date does not exist
- Before: `createReflexAgent(…)` accepted `{ on: { clock: { at: '2026-02-30T10:00', tz } } }`, which fires on 2 March.
- Now: the draft goes back to the model in the same run ("The clock's date 2026-02-30 is not a date. …"): one more model call for such a draft.
- You are affected if: the app runs the reflex agent with clock triggers.
- What to do: nothing.

### New warnings at `load`
- `load` warns about a reflex whose `timeoutMs` is not shorter than its `leaseMs`, and about a one-shot clock whose date does not exist, naming the day it fires on. Both still load and run as before.

### New, opt-in
- `load(reflexes, { at, resume: true })` for the load a process makes as it starts: a reflex this engine never loaded keeps its stored watermark, so its `catchUp` decides what the downtime runs. Without `resume`, `load` starts each reflex afresh, as before.

## @niscorp/vex

### An update that moves a row out of the caller's update rule is refused
- Before: an update writing a column a `match` rule pins (`project_id` under `match: 'project_id', in: 'projectIds'`) to a value that rule does not allow wrote it.
- Now: it is refused with 400 `scope_denied`, naming the rule and the column (`the new "tasks.project_id" is not one of the scope's "projectIds"`), and nothing is written; in a batch, the whole batch. A column a `set` rule stamps is not checked. An insert's `onConflict … set` that would move a row leaves it and answers `[]` for it.
- You are affected if: an update, upsert or `onConflict … set` hands a row over (setting `owner_id` under an `owner_id = me` rule).
- What to do: if the app means it, set `mutations: { …, checkMovedRows: false }` on the handler or adapter (`executeWrites(client, def, { …, checkMovedRows: false })` at the library level).

### An unlocked endpoint warns that it manages fingerprints
- Before: an unlocked endpoint let whoever reaches it unprotect, delete or regenerate any entry, without a word.
- Now: the Hono and Express adapters log one warning as they mount such an endpoint: `[vex] This endpoint is unlocked and manages fingerprints: …`. With `manageFingerprints: false`, `PATCH` and `DELETE` answer 403 `locked` and the endpoint still generates. Management stays on by default. moss's endpoints are locked and do not warn.
- You are affected if: the app mounts an unlocked endpoint.
- What to do: set `manageFingerprints: false` unless everybody who reaches it may manage entries.

### `engine.execute` serves an entry at the reach it declares
- Before: `engine.execute` replayed an entry that declares a `reach` under the policy it was handed, whatever the reach.
- Now: pass `policyForReach` and the run uses the policy it returns (`undefined` throws `scope_denied`). Without it the run is as before and logs one warning per fingerprint: `[vex] "<fingerprint>" declares reach "<reach>" and was replayed without policyForReach, …`.
- You are affected if: the host calls `engine.execute` itself on entries that declare `reach`.
- What to do: pass `policyForReach`.

### Discovery lists only what runs
- Before: an engine created with `createQueryEngine({ adapter, scope })` and mounted without a policy of its own (no `getPolicy`, or `handleDiscovery({ engine })`) listed every table and fingerprint, a denied `secrets` table included, although a query there is refused it. Entries whose `exists` read a table the caller cannot read were listed.
- Now: each table and entry is listed only where the policy it runs under lets it run: tables and read entries by the handler's or request's policy, else the engine's; a write entry by `mutations.policy`. `rowCount` is unchanged.
- You are affected if: a client reads such a listing and relies on seeing what does not run there.
- What to do: nothing. To list more, give the handler its own policy (`scopePolicy`, or `getPolicy` on an adapter).

### A table joined to itself is filtered on every copy
- Before: in a query that joins a table to itself, the row rule applied to one copy only, so the other read every tenant's rows.
- Now: every copy gets the caller's row rules.
- You are affected if: an entry joins a table to itself (a parent task, a manager who is also a person): rows outside the caller's rules drop out.
- What to do: nothing.

### A semantic filter's `$scope` text comes from the server
- Before: the text of `{ semantic: { query: { $scope: key } } }` was read from the caller's context, so a caller could choose it, and a missing value answered empty.
- Now: it is bound as a scope value the host supplies; a request without it is refused with `missing_scope`.
- You are affected if: an entry has a semantic filter with `$scope`.
- What to do: supply that scope value from the server.

### An `upsert` with a `null` key inserts where the database makes the key
- Before: `{ op: 'upsert', table: 'tasks', key: 'id', columns: { title: … } }` called with `{ id: null, title: 'new' }` ran `UPDATE … WHERE id = NULL`, wrote nothing, and answered 200 `[]`, even where the database fills `tasks.id`.
- Now: where the key column has a default or is an identity column, and the entry does not write the key itself, a `null` key inserts the row and answers it. A caller whose policy grants update but not insert gets 400 `scope_denied`, as for an absent key. Introspection gives an identity column a `defaultValue` (`GENERATED ALWAYS AS IDENTITY`).
- You are affected if: a client sends `null` as an upsert's key on a table whose key the database fills.
- What to do: nothing.

### `mergeScopePolicies` keeps `public` and `write`
- Before: `mergeScopePolicies([{ default: 'deny', entities: { countries: { public: true } } }])` gave `{ entities: {} }`, refusing the public table. A `write` list was dropped: `{ read: [], write: [tenant], update: [] }` merged to an update with no rule, across tenants.
- Now: `public` merges to all four phases with no rule; `write` is added to insert, update and delete, so that example updates only the tenant's rows. Policies made by `createScopePolicy` (moss's) merge as before.
- You are affected if: the app merges hand-written policies.
- What to do: write the merged rules out by hand if the old merge was relied on.

### The "last used" stamp writes `lastUsedAt` alone, where the cache has `touch`
- Before: a replay due a stamp wrote the whole entry back through `cache.set`, which could undo a `PATCH` or a reseed landing in between.
- Now: `CacheBackend` has an optional `touch(key, lastUsedAt)`; the memory, Postgres and tiered caches implement it, and the engine and handler stamp through it where it exists. moss wraps every cache in its own entry cache without `touch`, so moss apps stamp through `set` as before.
- You are affected if: the host wraps a built-in cache by spreading it and overriding `set` to watch writes: stamps now go through the inherited `touch`.
- What to do: override `touch` too.

### The error log line carries no bound values
- Before: an unexpected error logged the whole error object; under PGlite it carries the SQL and every bound value, the caller's scope among them.
- Now: `[vex] unhandled error <code> in: <SQL>` and the stack; the SQL only where the driver's error carries it. What the caller receives is unchanged.
- You are affected if: something parses that log line.
- What to do: nothing.

### New, opt-in
- `mutations: { …, answerReadableRows: true }`: a write answers only the rows the caller's read rules show.
- `manageFingerprints: false` on the handler and the Hono and Express adapters.
- `createPostgresAdapter({ …, qualifyTables: true })`: every table is named with the adapter's `schema`, so no `search_path` is needed; `introspect()` reports it as `namespace`.
- The Express adapter takes `getPolicy(req)`, `getPolicyForReach(req, reach)` and `onExecute`, as the Hono adapter does.
- `QueryEngine.scopePolicy`: the policy given to `createQueryEngine`.
