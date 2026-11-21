# Fix proposals, 2026-11-15: index

Fix proposals for every open item from three reviews of the nisc packages, written against branch `review-fix/all-check` (39c246ab). Nothing is built.
Each file was written by a proposer, independently checked, and revised once. Where a file says a proposal was prototyped, its behaviour tests ran on a copy of the package, against today's code and the prototype.
The owner's rule for all of them: "NO BREAKING CHANGES ... everything needs to keep working...". A line starting "Owner to confirm" marks a fix that changes a result, argued as non-breaking because no working app can rely on the old result.

## Counts

| File | Items | Proposals | Ready, changes nothing | Ready, with "Owner to confirm" | Needs owner decision | Already fixed |
|---|---|---|---|---|---|---|
| [moss-charter.md](moss-charter.md) | 27 | 20 | 12 | 2 | 6 ᵃ | 0 |
| [nova.md](nova.md) | 33 rows (30 distinct) | 23 | 8 | 15 | 8 ᵇ | 1 |
| [vex.md](vex.md) | 30 rows (26 distinct) | 18 | 6 | 5 ᶜ | 10 ᶜ | 1 |
| [prism-loom.md](prism-loom.md) | 46 | 36 | 13 | (19) ᵈ | 23 ᵈ | 4 |
| [signal-cortex-solid.md](signal-cortex-solid.md) | 53 rows | 28 | 25 rows ᵉ | 16 rows ᵉ | 8 rows ᵉ | 4 |
| [tide-strata.md](tide-strata.md) | 35 rows | 19 | 16 rows ᶠ | 9 rows ᶠ | 8 rows ᶠ | 2 |
| [cli-create-nisc.md](cli-create-nisc.md) | 52 rows (44 distinct) | 32 | 18, plus 3 "no change" ᵍ | 3 | 8 | 1 |

- ᵃ P-M11 is counted as a decision, though its internal renames are ready. P-M3 and P-M8 are ready, and each names a follow-on decision.
- ᵇ nova.md gives no totals; counted from its proposal sections and its "Owner decisions, collected" list. A7 is answered "no change: not dead", and C7 "no change" for `pop`/`popTo`.
- ᶜ vex.md counts parts: P3, P9 and P10 each have a part in both columns. Proposals with neither: P4, P11, P12, P14, P17, P18.
- ᵈ prism-loom.md counts all 23 proposals with an "Owner to confirm" line as needing a decision. 19 are fixes (under "Owner to confirm" below); 4 (P17, P19, P20, L13) propose no fix (under "Owner decisions").
- ᵉ Counted by table row; several rows share a proposal. Rows 1, 3, 5, 9 and 13 also have a part needing a decision. Row 37 (SOLID-P1) is a proposal whose status also says "owner yes needed".
- ᶠ Counted by table row: "ready" is 12 proposal rows, 1 tests-only and 3 docs-only. P-T6's row says "proposal", but its section has an "Owner to confirm" line. 3 of the 8 decisions ship docs now.
- ᵍ P15, P21 and P25 conclude that nothing should change.

## Ready to build: changes nothing for a working app

**moss and charter**
- P-M1a: webhooks sent chunked or with `Expect`, `Keep-Alive` or `Upgrade` reach the vendor (always 502 today).
- P-M3: a dev sign-in (`/dev/as/<who>`) through a tunnel logs a warning; nothing is refused.
- P-M4: `Host: app.example.com:443` no longer turns off cookie sign-in on the socket.
- P-M6, P-M10: docs (a terminal can publish any channel into its own shell; DOCS sentences that say what the code does not).
- P-M8: an endpoint declaring lower-case `authorization` is called as the session (401 today).
- P-M9: `bearer` in any case is accepted.
- P-M11, ready part: internal names and prose lose the banned word (decision 6 covers the public names).
- P-X1: outside names like `toString` or `constructor` are looked up as own keys: no more 500 for such a principal, no event for such a canvas reaching every action, a charter warning for such a role name.
- P-C1: a misspelt charter key (`denny`) shows over the page in `nisc dev`, after `nisc build`, and fails new apps' own check. Boot is unchanged.
- P-C4: a role whose `scoping` is not a string reaches no rows again, as on `main`, with a warning.
- P-C5: globs with many stars answer in milliseconds, with the same answers.
- P-C6: the charter report lists each role's `functions` when that universe is given.

**nova**
- N5: `resolveReferences` on a self-referring stored layout returns instead of overflowing the stack.
- N6: a canvas placed inside itself draws an error instead of crashing.
- N9: opt-in `keepTyped` keeps what was typed when a reconcile runs again (the default is decision 12).
- N13: opt-in `encodeValues` encodes values put into an endpoint URL.
- N15: a GET endpoint with a `request` body is reported to `onError`, and still loads.
- N19: opt-in `replaceDraftOnWrite` lets an action clear a focused field.
- N20: docs corrections (event bus, lax `clear`, negative `removeAt`, undeclared canvases, `$` rules).
- N21: nova joins the typed lint; `createShell` and the DOM adapter are split, moving code only.

**vex**
- P4: the Express adapter takes `getPolicy`, `getPolicyForReach`, `onExecute`; reach entries stop answering 500 there.
- P11: `exists` inside an aggregate's `case` compiles.
- P12: opt-in `qualifyTables` writes the adapter's schema name into queries.
- P14: `null` for `intent`/`fingerprint`, and nested nulls in `testQuery`, are accepted.
- P17, P18: a dead compiler branch and a dated DESIGN paragraph go.

**prism and loom**
- P2: `$fill` stops at the string limit instead of building hundreds of MB first.
- P14: `__optional` leaves out a `$get` that runs into `null`.
- P16: Intl formatter caches stop at 1,000 entries.
- P18, P22, P23: docs (`$walk` with `pre` can run to the budget; `$reduce` with `as` equal to `acc`; DESIGN's context type).
- P21: optional `timeZone` on `evaluate` and `execute`.
- L6: `onChange` fires once per edit, not twice.
- L7: fields named `toString` or `constructor` show their message.
- L9: loom's colours become CSS variables with today's values.
- L10: README note for a top-level `_errors` field.
- L11: a `z.preprocess` that throws on `undefined` no longer crashes compiling.
- L12: `parse` reads zod through its core classes, with no cast; loom gets module doors.

**signal, cortex and solid**
- SIG-P2: an abort during the SDK's 429 wait ends a stream at once.
- SIG-P5: `step()` returns reasoning the provider sends unasked (asking is decision 33).
- SIG-P7: an unknown `wire` id throws a `SignalError`.
- SIG-P8, docs part; SIG-P9: docs (which of two JSON values answers; multi-turn history; `stream()` with no key; a second "Abort" heading).
- CTX-P5: output schema `z.string()` accepts text that reads as JSON.
- CTX-P6: only real messages are taken as a transcript; other `role` lists go as JSON.
- CTX-P8: docs and small corrections (`duration()`, the event buffer, tool names, one timeout constant).
- SOLID-P1: finalization walks only direct children; 2,000 rows go from 22 s to 34 ms.
- SOLID-P8, SOLID-P9: docs (half-read numbers; a selection's `write()` does nothing).

**tide and strata**
- P-T3, fixes: fan-out waits until a reflex is loaded; `load` calls run in order. Opt-in `resume: true` runs catch-up after a restart (the default is decision 45).
- P-T4: a jsonb string that is not JSON text reads back as itself instead of throwing.
- P-T5: with the host's clock (the driver passes one), each task's lease is renewed as its effect starts, so no task runs twice.
- P-T8, load part: `load` warns about a one-shot date that does not exist.
- P-T10, P-S4, P-S5, P-S6: docs (tide DESIGN/DOCS mismatches; `--` lines in checksums; what `INVALID_SEQUENCE` covers; `CREATE INDEX CONCURRENTLY`).
- P-S2: `prepare([null])` throws `INVALID_SEQUENCE`, not `TypeError`.
- P-S7: strata's tests remove their temp folders.

**cli, create-nisc and the rulebook**
- P4, P5, P7: printed lines (paths that could not be drawn; an in-memory database; an empty `PORT=`).
- P6: an address that does not decode is a 400, not a 500.
- P10: the banned word leaves messages and docs.
- P11: cli and create-nisc become modules, moving code only.
- P12, P16, P29: rulebook and README wording.
- P13: a folder named `.gitignore` or `.env` is reported, not crashed on.
- P14: create-nisc's tests build first.
- P17–P20, P22–P24 (new apps only): `@niscorp/cli` is a dependency so a production `npm start` works; a model-first app reads its own `.env`; an empty key no longer hides the user's; a path with a space is quoted; template words match the code; PLAN.md says anyone can spend the Groq key; no `@niscorp/tide` dependency.
- No change: P15 (checks runner), P21 (kit), P25 (caret ranges).

## Owner to confirm: a fix that closes a hole

Each is a yes/no call: is this really non-breaking? Format: fix, then what changes.

**moss and charter**
- P-M7: a revoked session's socket closes within `sessionRevalidateMs`. Changes: the verifier is asked once per token, all together each pass; a verifier with a strict concurrency limit "would see a burst every interval".
- P-C7: a top-level `deny` beside an `actions:` section is applied. Changes: nothing under moss; a host calling `resolvePrincipal` without verifying "now denies what the top-level `deny` names".

**nova**
- N1: a mount hook navigates after its instance is on the canvas; a late suspend no longer leaves the top action suspended. Changes: `getCanvasState` lists the instance during its mount hook, and a first state snapshot can already show it.
- N2: a model-bound field with a `ref` in a loop writes its own row. Changes: its `model.ref` reads `qty@lines.0.qty`, visible in adapters, devtools, TTY commands and moss's render trees.
- N3: functions on a record's own prototype resolve again; `$.x.constructor` reads nothing. Changes: no binding reads `constructor`, `toString` or `__proto__`.
- N4: a stored-layout id in a fragment slot renders the layout. Changes: the layout shows instead of the id as text.
- N7: DOM and TTY kits register `CanvasSlot`. Changes: `registry.list()` names one more component.
- N8: `NovaShell` adds only missing React components. Changes: an app's own `Text` is shown instead of React's.
- N10: in a loop, `model: '$.<as>.x'` writes the row it shows. Changes: that, and `model: '$.index'` writes nothing.
- N11: `'$CAD only'` renders as text. Changes: it renders where empty today, and reaches `onPhraseMiss`.
- N12: strict mode reports a failed call nothing handles (`ENDPOINT_FAILED`). Changes: a strict app's `onError` is called.
- N14: a plain-text HTTP error body reaches `errorTarget.data`. Changes: `data` is present where missing today.
- N16: `for`/`model` written as one `{{…}}` keep their binding. Changes: such fields write what is typed.
- N17: a failure returning after a newer call of the endpoint returned is dropped. Changes: it no longer writes `errorTarget`.
- N18: translations go in as written. Changes: `$$` or `$&` in a translation render as written on text with spaces around it.
- N22: strict mode reports a throwing subscriber (`HANDLER_FAILED`). Changes: a strict shell's `onError` is called.
- N23 (not prototyped): a template-made negative `removeAt` index is reported, then applied. Changes: an app doing it on purpose gets a report.

**vex**
- P3, listing: discovery uses the engine's policy when the handler has none. Changes: such an endpoint stops listing what that policy refuses; moss is unchanged.
- P7: `upsert` with `id: null` inserts where the key has a default. Changes: it inserts "where today it writes nothing and answers `[]`".
- P8 (not prototyped): logs drop bound values; a caller's wrongly typed value is a 400. Changes: `400 invalid_request` instead of `500 22P02`.
- P9: `mergeScopePolicies` keeps `public` and `write`. Changes: wider for those; narrower for `{ write: [tenant], update: [] }`, which merges wider than any role today.
- P10, stamp: the "last used" stamp writes only `lastUsedAt`. Changes: a cache wrapper overriding `set` no longer sees stamps.

**prism and loom** (the file counts these as owner decisions)
- P1: `$update`/`$has` read paths as `$get` does. Changes: `"0"` over a list updates the item instead of turning the list into an object; other keys on a list or scalar are refused (`E_TYPE`); strata steps using `$update` this way give new results.
- P3: `$round` rounds at the decimals as written. Changes: ceil 1.1 → 1.1, 1.005 → 1.01; encore's `$round(zoneFill, 2)` can differ by 0.01; stored numbers differ.
- P4: overflowing arithmetic is `E_TYPE`. Changes: an error where today Infinity is stored as `null`.
- P5: `$localeMoney` takes the currency's divisor and refuses non-numbers. Changes: right amount for a refused locale; list, boolean, hex or blank amounts refused.
- P6: Intl refusals become `PrismError` `E_SCHEMA`. Changes: the thrown class changes.
- P7: impossible ISO dates (`2026-02-30`) are `E_DATE_INVALID`. Changes: input accepted today is refused, stopping such a document's strata upgrade.
- P8: a `__proto__` constant answers the same every call. Changes: from call two, as call one.
- P9: a precomputed constant costs its steps. Changes: a config near its limit is refused on every call.
- P10: `$min`/`$max` skip `null` anywhere. Changes: 9 steps per item, not 8, so lists of about 111,000–125,000 items are refused; fingerprints change once.
- P11: `$replace` writes the replacement as given. Changes: `$$` stays `$$`.
- P12: text is never cut inside a character. Changes: shorter results.
- P13: `$interpolate` fills names in any script. Changes: `{{straße}}` gets its value or `""`.
- P15: date and locale ops are not precomputed at compile. Changes: fingerprints change; an IR answers in the zone it runs in.
- L1: optional fields can be removed; starting values come from one place. Changes: new prism ops get no optional arguments; `includeOptional:false` and `empty` apply in unions; optional field nodes gain `model` and `optional`.
- L2: a union shows the matching branch, or JSON. Changes: unknown stored values show as JSON; `parse` can name another pattern key.
- L3: a literal starts as its value. Changes: a select, not a raw box at `null`.
- L4: clearing a non-nullable number leaves it absent. Changes: a missing key instead of `null`.
- L5: an empty select shows "—". Changes: display, a README note, two package tests.
- L8: an object with a dotted key is edited as JSON. Changes: a JSON box replaces controls that wrote the wrong place.

**signal, cortex and solid**
- SIG-P1: replies report their finish reason; opt-in `refuseCutOff`. Changes: "a Groq tool call cut inside its arguments is no longer run with the closed arguments"; the model gets `input_invalid` and calls again (lyceum, encore, relay).
- SIG-P3: tool-call pieces are told apart by id too. Changes: a repeated index with a new id gives two calls, not one broken one.
- SIG-P4: no schema plus a rejected reply throws `E_PROVIDER_ERROR`. Changes: rejects where it resolved `''`.
- SIG-P6: `.apiKey()` overrides a custom provider's key. Changes: the given key is sent.
- CTX-P1: `onToolResult` hooks see errors, so secrets can be redacted. Changes: hooks run on errors; one returning `{ result }` without looking "now replaces error texts too".
- CTX-P3: a parent handle answers its delegated agent's approval. Changes: `run.approve` on the parent now works (ignored today).
- CTX-P4: a resumed run first runs its last step's unanswered calls. Changes: they run before the next model call.
- CTX-P7: `resumeRun` checks the snapshot. Changes: a broken snapshot throws there, naming the fault.
- SOLID-P2: a stream ends once. Changes: `select(p).final()` after a strict failure rejects; a root key `""` resolves at the real end.
- SOLID-P4: any-typed fields keep their contents; string formats are kind-checked. Changes: contents kept; "for a knowing owner yes", `z.email()` given a number is refused and strict `final()` rejects.
- SOLID-P5: no `initial` needed for schemas like `.min(1)`. Changes: `createStream` stops throwing; relay's screen builder gets 27 `output-partial` events per answer (0 today), lyceum's nova layout 20.
- SOLID-P6: union fields are checked against every variant. Changes: a later variant's value is kept.
- SOLID-P7: `Infinity`, hex, `+5`, `.5` are not numbers. Changes: refused; valid JSON is untouched.

**tide and strata**
- P-T1: manual facts are matched within one identity; `ingest` refuses `kind: 'run'`. Changes: cross-identity manual facts stop running; a run fact throws `invalid_fact`.
- P-T2: a failed fan-out waits before its retry. Changes: with defaults, after 60 s, 120 s, 240 s, not the next advance.
- P-T6: the memory store claims serial groups first, as Postgres does. Changes: such tests see serial tasks claimed earlier.
- P-T7: daylight-saving times resolve correctly in +12/+13 zones. Changes: Auckland, McMurdo and Chatham fire at the documented instant on two days a year.
- P-T8, agent part (not prototyped): the reflex agent returns drafts with non-existent dates. Changes: one more model call for such a draft.
- P-T9: Postgres-minted ids are UUIDs. Changes: new ids lose the `fact_mwi60d3d_1` shape.
- P-S1: non-number stamp entries are refused or reported. Changes: `upgrade()` throws `INVALID_SEQUENCE`; under moss such a bundle is refused at intake and such an action is not served; moss discards the `unread` report.
- P-S3: strata believes and removes only its own files. Changes: in a chosen `workDir`, a foreign `REPORT.md` or `plan.json` makes `upgrade` exit 1; `verify` refuses a plan from another lock.

**cli**
- P3: exports are written into a fresh folder first. Changes: "on Windows a path that today writes outside the export's folder (exit 0) is refused (exit 1)".
- P8: the compression cache goes. Changes: "an answer that today can be another person's is now always the request's own".
- P9: the shape check reads what names refer to and prints `[info]`. Changes: the README must say which spellings fail (making `[info]` fail needs a yes); a `<const>`-only `allow` would fail.

## Owner decisions

**Start here (most important):** 1 (webhook cookie), 4 (artifacts deleted after downtime), 18 (vex writes escape the caller's rules), 19 (`answerIntent` ignores reach), 21 (anyone manages fingerprints), 37 (a timed-out tool keeps running), 45 (catch-up after a restart), 54 (`export --out` empties any folder).

"Yes:" is what saying yes costs; "No:" is what stays open.

**moss and charter**
1. **(most important)** P-M1b: stop the webhook door passing the visitor's cookie and operator key, and sandbox the vendor's HTML? Example: any page posts a visitor to `/integrations/acme/hook/x`; the vendor gets the session cookie and its `<script>` runs as the app. Proposed: yes. Yes: a landing page loses the app's storage (a PKCE verifier), and forms it posts back arrive signed out. No: both holes.
2. P-M3: refuse dev sign-in through a tunnel (403)? Proposed: warning only. Yes: Codespaces and dev tunnels break until `signInFromNetwork: true`. No: anyone with the tunnel address signs in as anyone.
3. P-M2: support webhooks carrying `Authorization: Basic`? Proposed: docs. Yes: two new mechanisms. No: they never reach the hook.
4. **(most important)** P-M5: should downtime count as unused? Example: with `artifactsUnusedMs` one day, artifacts last used 26 hours before a restart are deleted for everyone at boot. Proposed: docs, an opt-in if wanted. Opt-in: a process restarted more often than the limit never ages anything. No: the deletion.
5. P-M8: on a shell for nobody, drop an endpoint's own `Authorization`? Yes: breaks a fixed service token on a public screen. No: a token from action data is used.
6. P-M11: the banned word in a public `WireTokenStore` field and the session cookie suffix. Field: add a second name, or leave it. Cookie: proposed keep; renaming means writing both names on every sign-in, in practice for good.
7. P-C2: a string where `deny`/`without` expects a list. Proposed: refuse it. Refusing: `deny: '*'` as a string and `without: 'ab'` (roles `a`, `b`) stop booting. One pattern (the branch): a host resolving without moss denies less than on `main`.
8. P-C3: `*` matches a line break in `allow` too? Proposed: yes, one rule. Cost: such ids are granted; no lab app has one.
9. P-M10: reorganise moss's 3,312-line DOCS? Not proposed.

**nova**
10. A1: an actions-map key differing from the id: loading under the id, or refusing, is a break.
11. A2: `removeAt` with a computed `-1` removes the last element; refusing negatives is a break (N23 reports it).
12. B1/N9: should a reconcile restore every row each time (today) or write only changed rows (ACTION_DOCS)? Proposed: keep the default, add N9's opt-in. Changing it breaks encore, which relies on putting `tue` back over a typed `fri`. No: a repeated reconcile resets typing.
13. C1/N1: a mount hook that pushes a child pushes it again when its opener returns. Fixing needs a once-only hook (new mechanism) or a `resume` change (a break).
14. N12 + N22: report failed calls and throwing handlers in lax mode too? Yes: mythos logs new errors; relay's screen builder gets new findings and turns away screens calling unknown endpoints. No: silence outside strict mode.
15. B5/C14: a push to an undeclared canvas is invisible. Reporting fires for deliberate uses; refusing is a break.
16. B3/C11: `'$'` is the whole scope, sent by moss to the client; `'$USD'` is a path. Making either text is a break.
17. N13: make `encodeValues` the default later? Yes: breaks `{{$.apiBase}}/notes`. No: `../users/42` enters URLs raw.

**vex**
18. **(most important)** P1: keep writes inside the caller's rules by default? Example: a caller limited to project pA moves a task into pB; a rename answers another person's whole row (`salary: 900`). Proposed: opt-ins `checkMovedRows` and `answerReadableRows`, off. On by default breaks handing a task over via `owner_id` and lyceum's `login/redeem`. No: both holes for apps that do not opt in.
19. **(most important)** P2: should moss's `answerIntent` replay an entry at its declared reach? Example: `tasks/mine` (`reach: 'personal'`) answers the tenant's two rows through `answerIntent`, one through `/api/vex`. Proposed: yes. Yes: fewer rows or a refusal; no lab app replays such an entry. No: the wider replay. moss-charter.md names the same item and leaves it here.
20. P3: hide `rowCount` where the caller cannot read every row? Proposed: a DOCS line. Yes: lyceum's and relay's discovery lose counts. No: counts span tenants.
21. **(most important)** P5: turn off fingerprint management on unlocked endpoints? Example: any caller unprotects, deletes or regenerates a seeded entry, and locked endpoints replay it. Proposed: `manageFingerprints` and a warning now; README's agent endpoint sets `false`. Default `false` breaks an admin console using its agent endpoint. No: open management.
22. P6: limit `sortBy` to returned columns? Proposed: opt-in. Default breaks sorting by a column the list does not show (relay sorts deals by `created_at`). No: a hidden column's order leaks.
23. P9: a policy form for "any of these rule sets"? Cost: new policy grammar. No: the first role wins (fails closed).
24. P10: list the tiered cache's entries? Yes changes lyceum: more generated actions and defaults shown, fingerprints listed, the whole cache table read per call. No: discovery lists nothing (documented).
25. P13: a `{ $value }` literal form? Cost: exported union, DSL schema and agent prompt change. No: `$context` only.
26. P15: answer `null` for an object entry missing context? It breaks `result.title` readers.
27. P16: one shared filter walk? It saves edits but touches the scope walker, where a mistake is a security bug.

**prism and loom** (plus the 19 fixes under "Owner to confirm")
28. P17: order-free `$eq`? It changes documented answers in 106 lab files, or a new op costs every app a `strata upgrade`. Proposed: docs.
29. P19: refuse lenient `$ref` spellings (`$.a.`)? Every app's `strata upgrade`. Proposed: docs.
30. P20: a warning on `validate` for a dropped `__proto__` key? Proposed: no change.
31. L13: fold the prism node editor into `toNova` and the kit? A design change.

**signal, cortex and solid**
32. SIG-P1: refuse cut-off replies by default? Example: `{"total": 12` cut from 1234 passes. Yes: a reply cut every time goes from 1 to 20 calls in cortex; nobody measured how often. No: cut data passes, now reported.
33. SIG-P5: should `step()` request reasoning? It moves Qwen's `<think>` text out of `content` on Groq.
34. SIG-P8 + SOLID-P3 (one linked decision): with two JSON values, should the last win on OpenAI (`draft` → `final`)? Should solid stop reading when the root closes (breaking; solid's own test splits)? If the first value stays, SOLID-P3 aligns cortex's partials; if the last wins, SOLID-P3 should not ship.
35. SIG-P9: remove duplicate system messages in code? It changes the request.
36. SIG-D1: turn `''` tool arguments into `{}`? Only if a provider refuses them.
37. **(most important)** CTX-P2: abort a tool's `ctx.signal` at its time limit? Example: `send_email` told "timed out" runs on and sends twice. Yes changes relay: a screen build past 12 minutes no longer lands on main. No: tools outlive their timeout.
38. CTX-P3: nested approvals surviving reload (new mechanism)? Parent `gates` reaching delegated agents? Docs now.
39. CTX-P8: use `corrections.termination`? It changes what the model is sent.
40. CORTEX-5: resolve the transport per step for `prepareStep`'s model? A new mechanism.
41. CTX-D1: use signal's token count in cortex? Needs a higher peer floor (breaking); leaving it costs two small copies.
42. SOLID-P8: stop showing half-read numbers? The fix fails solid's own test.

**tide and strata**
43. P-T1: link reflexes within one identity only in the cycle check? Yes: a loop is missed where an app maps writes to another identity. No: some safe loads refused.
44. P-T1: add the identity to the fact dedupe key? Yes: an exported constant and a `TIDE_SEQUENCE` migration; lyceum refuses to boot until `nisc migrate`. No: two tenants sharing a key lose the second fact.
45. **(most important)** P-T3: catch-up after a restart by default? Example: a daily reflex down three days runs nothing; a lyceum talk timer due during a restart never fires. Proposed: opt-in `resume: true`. Default: every restart runs missed occurrences; a re-added reflex gets its absence as downtime; per-request engines start firing clocks. No: missed runs, with no row saying so.
46. P-T4: read jsonb strings exactly (`'123'` stays text)? It changes values hosts rely on.
47. P-T10: mark `Retention.tasks` deprecated (lyra uses it)?
48. P-T11: let the reflex agent write templated inputs? A new option. Proposed: no.
49. P-T12: the delayed-fact index. Proposed: in the first change that must touch `TIDE_SEQUENCE`.
50. P-S1: should moss log strata's `unread` rows at boot? A moss change.
51. P-S4: version the checksum for `--` lines in literals? Changing it stops databases that ran such lines.
52. P-S5: split `INVALID_SEQUENCE`? Breaks code tests and exhaustive `switch`es.
53. P-S6: version embedding paths (STRATA-2)? A new grammar option.

**cli, create-nisc and the rulebook**
54. **(most important)** P1: should `export --out` remove only what an export wrote? Example: `--out ../victim` deletes `.git`. Proposed: yes; the default `out/` is emptied as today. Yes: old files stay (named each run); a staging `robots.txt` ships; CI removes nothing. No: any folder but four is emptied.
55. P2: should `nisc migrate` refuse an argument it does not read? Example: `migrate --dry-run` migrates. Proposed: yes. Yes: `migrate --yes` in a deploy fails; `-h` exits 0; stderr warnings may fail CI.
56. P26: split AGENTS.md (64,882 bytes) into a core under 32 KiB plus eight step files, with a size gate? Proposed: yes. Cost: an agent skipping pointers misses rules; "Before working around a limitation" leaves the core. Optional: a one-line `CLAUDE.md`.
57. P27: add tide's four tables to what `*.read` must deny?
58. P28: was the rule "pnpm", or "the package manager's add command"?
59. P30: write the `Error`-subclass exception into the package class rule, or ban classes (eight packages change)?
60. P31: make nisc-website and moccadroid-website public, then name them? Proposed: yes.
61. P32: spend agent builds to measure the rulebook split?
62. P11: nine more flat packages, each its own case.

## New mechanisms

- moss P-C1: charter warnings on Vite's error overlay, after `nisc build`, and in a template check. charter P-C6: `RoleClosure.functions`. moss P-M11, if chosen: a second `WireTokenStore` field.
- nova: N2 per-row model ref `<ref>@<path>`; N9 `lastInputs` and `keepTyped`; N12 code `ENDPOINT_FAILED`; N13 `encodeValues`; N14 `FetchResponse.clone`; N19 `replaceDraftOnWrite`; N22 `onHandlerError` and code `HANDLER_FAILED`.
- vex: P1 `checkMovedRows`, `answerReadableRows`, `WriteResult.readable`; P2 `policyForReach` (and moss `policyAtReach`); P3 `QueryEngine.scopePolicy`; P4 three Express fields; P5 `manageFingerprints`; P6 `sortByColumns`; P10 `CacheBackend.touch` (tiered `entries()` if chosen); P12 `qualifyTables`, `DatabaseSchema.namespace`; P13 `{ $value }` if chosen.
- prism: P9 step cost carried on a node; P14 `details.absent`; P15 `EvalContext.folding`; P21 `timeZone` option and a fourth `execute` parameter.
- loom: L1 `optional` prop and `model` on `loom:field`; L4 `FieldMeta.nullable`; L9 `--loom-*` CSS variables in `react/kit/tokens.ts`; L12 `index.ts` doors.
- signal: SIG-P1 `refuseCutOff` (three places), `meta.finishReason`, `wire.truncated`; SIG-P5 `reasoning` on results. cortex: CTX-P3 `ToolContext.forwardApprovals`.
- tide: P-T2 in-memory deferred-run map (internal); P-T3 `resume`; P-T5 `clock`. strata: P-S1 `StoreReport.unread`.
- cli: P1 record at `node_modules/.cache/nisc/exports.json`; P2 flag table and stderr warnings; P3 fresh `.nisc-export-<random>/` folder; P9 second reading with `[info]` lines. create-nisc: P14 `vitest.config.ts`. rulebook: P26 eight new files and a 32 KiB gate.

## Not built or not prototyped

- moss-charter.md: the browser half of P-M1b (webhook sandbox) was reasoned, not run; full `pnpm verify` not run.
- nova.md: N6 (canvas inside itself) for DOM, React, Vue; N9's step field; N13 (URL encoding), N15 (GET body), N19 (focused field), N20 (docs), N21 (lint), N22 (handler errors), N23 (negative index); moss's suite not rerun.
- vex.md: P5 (fingerprint switch), P6 (`sortBy`), P8 (typed values; also not tried on node-postgres), P12 (schema names), P13 (literal form), P14 (nulls), P15 (missing context), P16 (one walk), P17 (dead branch), P18 (DESIGN paragraph); P7's null-scope warning; P3's `rowCount` (by decision).
- prism-loom.md: none marked; P17, P18, P19, P20, P22, P23, L10, L13 are docs or no change.
- signal-cortex-solid.md: none marked; SIG-P8, SIG-P9, most of CTX-P8, SOLID-P8, SOLID-P9 are docs.
- tide-strata.md: P-T8's agent part (non-existent dates), P-T11 (templated inputs); P-T12 (index) is no code; P-T5's (lease renewal) check on a real Postgres was not run.
- cli-create-nisc.md: none marked; P12, P16 and P27–P31 are text; P32 (agent builds) is a run plan.
