# The screen builder: what was wrong, what changed, where it stands

2026-10-18, branch `worktree-artifactory`, commits `4763bed4` … `fb64f7b9` (18 commits,
33 files, +417 −128). Not pushed; CI has not run on them.

The screen builder is relay's assistant tool that turns a sentence ("filter deals by expiry
date") into a nova action: it proves queries through vex, mounts the candidate in a throwaway
shell (`run_action`), and answers with the definition. The owner's goal for this work: a lean,
reliable pipeline that vex's and nova's agents run at the lowest bound (qwen at Groq's
`default` effort, no reasoning), with relay's own conventions added back afterwards.

## Where it started

The first build from the chat looped on `query {"fingerprint":null,"intent":null,"shape":null}`
until it ran out of steps, Stop did nothing, and the chat said "no reply within 30000ms".
Measured on relay's architect suite (9 screens, one build each), the builder built **0 of 9**
on qwen and **2 of 9** on GPT-OSS 120B, with **no** screen showing rows on the live server.
The code that built 9/9 on 2026-09-25 built 0/4 on qwen the same day.

## What was wrong

**Defects of relay's own, older than this branch**
- Stop never reached the builder: the build tool started it without the run's abort signal.
- The chat's call to the assistant waited nova's default 30 seconds; every build looked dead.
- A harness check, and the matching rule in the builder's instructions, demanded a `set` before
  every `ui:model` reload "because of a race". nova removed that race on 2026-09-03 (`04b269af`).
  The check refused correct search screens; models garbled their triggers trying to satisfy it.

**Mine, from the artifactory port (`abcc9319`)**
- The dev harness made a new in-memory database for every query and every replay, so a query a
  build proved was a `cache_miss` when its screen replayed it. Every dev-script measurement of a
  build that wrote a new query was void until it was fixed.
- A replay went over the session's wire, which answers rows alone: vex's `missingContext` was
  lost, so an empty replay was an unexplained `count: 0`, and models replayed it again and again.

**The provider, and how the tools met it**
- qwen as Groq serves it answers `null` for every tool field whose schema allows null. zod's
  `.nullish()` serialises to `["string","null"]`; three of the builder's fields used it.
  Proved by replaying the captured request straight to Groq: 4/4 nulls as sent, sensible calls
  with the one change. 120B was unaffected either way.
- Relay sampled qwen greedily (temperature 0), which Qwen's model card says makes it repeat.

**The pipeline**
- vex's shape mapper never saw the intent, so money and dates could not be formatted however
  the intent asked. A shortcut added on 2026-09-27 (`05e0ff81`) also skipped the mapper whenever
  the rows already had the shape's keys and kinds, so a raw timestamp stayed raw.
- The mapper's prism was never run on its rows before use: one that referenced a missing path
  failed the whole query with "Path not found".

**The harness: the builder could not see, or could not hand over**
- Models finished and never handed the screen over: one ran the identical passing screen 14
  times, each time told it was done. Others broke their final JSON re-typing a screen that had
  passed.
- The query tool's `shape` was a required parameter, so a replay invented one.
- A proof could not know the signed-in user, so a query on "my" rows could not be proved.
- Proofs were sent endpoint syntax (`"{{$.today}} +6d"`) and the database refused it.
- A transform that threw was reported as "status 0" with no reason; prism's issues were dropped.
- `run_action` checked that data loaded, not that a Table showed it, nor that a choice changed it.
- Relay's house style asked for formatting a generated query could not give; models chased it.
- The architect suite's live check read a different database from the builder's, so every
  screen built on a new query counted as zero live rows.

## What changed

| package | commit | change |
|---|---|---|
| relay | `4763bed4` | Stop reaches the builder and its reviewer; the chat waits a minute past the assistant's 15-minute bound |
| relay | `fb2bf916` | the dev scripts keep one database |
| moss | `edd32717` | `session.answerIntent` also replays `{ fingerprint, context }`, with vex's meta (patch) |
| relay | `7a0ac9c3` | the builder's tools offer no null; a replay goes through `answerIntent` and says what context it misses |
| relay | `84d6df55` | a query re-sent with the same context is told its answer will not change |
| vex | `1c78d6d9` | `MapToShape` is `(rows, shape, intent?)`; the engine passes the intent; the mapper hands it to prism's agent as `notes` (patch) |
| relay | `d36b641c` | qwen samples at Qwen's settings (0.7/0.8 without reasoning, 0.6/0.95 with); the writers pass the intent on |
| relay | `74660b73` | the race rule and its check are gone |
| relay | `07e56b1b` | a passing `run_action` says the screen is done |
| relay | `0c309f29` | the suite proves its queries in the database its live server reads |
| vex | `bcd222d4` | the mapper asks the agent for every new query (the fit shortcut no longer skips it) (patch) |
| relay | `31984359` | the last passing screen is the result when a build ends without an answer; three identical calls end a build (`repeatedCalls`); a replay says it cannot change order, form or columns; a Table that shows nothing is refused |
| relay | `be0f9f8c` | no house style or channels for the builder and its reviewer |
| vex | `cab9be91` | a mapping is run on its rows before use and written again, told why, up to three attempts (patch) |
| relay | `baad0d8e` | a refused answer after a passing screen ends the build; proofs get `userId` and `today`; a failed transform keeps its reason |
| relay | `ff1e0093` | `shape` is optional; a proof refuses endpoint syntax and says what to send |
| vex | `b6e808a8` | the mapper is told the rows already answer the request: form only, every row kept |
| relay | `fb64f7b9` | a failed transform carries prism's issues; a failed replay lists its context with types; a select-type choice that changes nothing is refused |

Tried and dropped: 120B at qwen's sampling went 0/4 where temperature 0 gave 1/4.

Tests added: vex — the intent reaches the mapper (engine and agent), the mapper is asked when
rows fit, a failing mapping is written again (each mutation-checked); moss — a replay through
`answerIntent`. Suites at the end: vex 665, moss 1325, lint, the changeset rule, relay's
typecheck and its dev checks, all green.

## Measurements

Architect suite, one build per screen, relay's own live check (rows rendered on a real server
against the database):

| | qwen, effort `default` | GPT-OSS 120B |
|---|---|---|
| start of day | 0/9 built, 0 live | 2/9 built, 0 live |
| September's code, same day | 0/4 | — |
| after the null schema + replay meta | top10 and search build | 2/2 on top10/search |
| after A–G (race, done note, live DB, fallback, mapper, render check) | 2/2 on top10/search | 6/9 built and live |
| no house style | — | 6/9, four matching the database exactly |
| after H–K | — | 6/9, feed for the first time |
| after L–M | — | 7/9 built and live |
| final (N1–N4) | **7/9 built, live and correct** | **7/9 built and live** |

Builds that pass are fast now: 120B built wonlost in 12.7 s with 3 tool calls, search in 9.6 s.
With one build per screen, which two fail moves between runs.

Live in relay, the owner's first request ("give me a new action that lets me filter deals by
expiry date") through the chat, qwen as builder and reviewer: built and placed in about 110 s,
a titled screen with start and end dates and a sortable table — and its date filter does not
reach the query (120 deals shown for a three-month range). The reviewer, also qwen, had its
verdict refused twice and the screen shipped unreviewed.

## Where it stands

- The mechanics hold at the lowest bound: qwen without reasoning builds most of the suite,
  proves its data, binds it, and hands the screen over, at the speed of a few tool calls.
- Semantic correctness is now the weak link: a screen can look right and not do what was asked.
  The check for that is the reviewer, and on qwen it fails its own output format.

## Open

- **The reviewer**: measure it (the suite runs the builder alone), and make it reliable at
  the lowest bound — the same treatment as the builder.
- **Choices beyond selects**: N3 picks another option of a select; date and text inputs, and
  apply buttons, are not exercised.
- **vex**: ordering by an aggregate (overview's "stages by combined value") fails in the query
  writer; PGlite refuses string booleans that Postgres accepts (workspace).
- **The suite's own checks** read search as names only and the week boundary one way.
- lyceum and showroom wrap the mapper without passing the intent.
- `rowsFitShape` is still exported from `@niscorp/vex/agent` and no longer used by vex.
- Relay's house style and channels are to be added back once the pipeline under them holds.
- The defaults still run builder and reviewer on qwen; 120B stays at temperature 0.

## The module (evening of 2026-10-18)

The proposal in [screen-harness-review.md](screen-harness-review.md) is built inside relay, with
no package change: `apps/lab/relay/src/screen-builder/` (`4ba6151e`, `edf341a6`). It imports nova,
cortex and vex, and neither moss nor relay. The host hands it a kit (registry, offered components,
list components, layout rules, examples with probes), vex's own call shape (`discover`,
`execute`, the endpoint URL), the push catalog, its wire, its endpoint transform and the ambient
values. Relay's side is `server/functions/ray/screens/`: the setup, four examples, and the
build/keep/discard tools. The reviewer is gone.

**What replaced what**
- The reviewer → probes. The builder states what a person does (set a ref to a value, click a
  ref; a row ref clicks the first row) and what must follow (a data key changes, an action opens
  with its required input, or, for a click alone, a data key is loaded again). Every control or
  row whose trigger loads data or opens a screen needs one. Each probe runs on a fresh mount. One
  that changes nothing says whether the request never changed or the answer did not.
- The final answer → a passing check is the result and ends the run. An answer before a pass is
  sent back. At most one repair of the last screen the check found fault with.
- The fp_ regex, the layout directive list, the audit message rewrites, the `cache_miss` advice
  → structural reads: fingerprints read from the endpoints that post to the vex URL, values that
  did not resolve read from the rendered props, data no layout binds read from nova's own
  `collectInteractive`.
- The ActionDefinition JSON Schema in context (19.7k characters) → a compact reference (2k).
  The whole context fell from 52k to about 31k characters, tools included.
- The dev path and the product path are one: the suite builds through `screenSetup(ray)` on the
  same `RayContext` the session uses.

**Measured** — architect suite, one build per screen, the relay server's live check against the
same database. `expiry` is the owner's request of this morning, added as a tenth screen.

| | built and live (9 original) | expiry | median build |
|---|---|---|---|
| old builder, best of the day, qwen | 7/9 | wrong data | — |
| old builder, best of the day, 120B | 7/9 | — | — |
| module, qwen, pass 1 | 7/9 | right | 13.6 s |
| module, qwen, pass 2 | 8/9 | right | 10.1 s |
| module, qwen, final code | **9/9** | right | 12.3 s |
| module, 120B, pass 1 | 7/9 | right | 8.6 s |
| module, 120B, final code | **9/9** | right | 14.1 s |

Each pass ran on the code as it stood; the fixes between passes are in `edf341a6`. "Right" means
the suite set the range to July and the table showed the database's July count.

Live in relay, after a restart of the dev server, the same request through the chat built in
15 seconds (one proof, three checks), and setting the range to July in the real date inputs
showed the 6 July deals. This morning the old builder took 110 seconds and showed 120 deals for
any range.

**Where it stands**
- Probes check what the reviewer could not: in relay's check script (`harness-check`, no model) a
  search whose value never reaches the query fails its probe with the context the endpoint sent,
  and the owner's request now builds right on both models and in the live chat.
- qwen still writes a Table's props beside `component` and flattens `push` on most builds; the
  check shows it what it sent, and it corrects both within a step or two.
- The suite's search oracle counts names only, while the shipped companies query matches more;
  its week oracle reads the boundary one way.

**Open**
- **Values frozen into a request**: the week-of-tasks screen sends today's date as a string, so it
  goes stale tomorrow; no check sees a literal that equals an ambient value.
- **qwen's two habits** (props beside `component`, a flattened `push`) cost a step or two per
  build; the examples show both right.
- **A click on a button carries no payload in a probe**; relay's Button sends its `value`.
- **Relay's own**: the house style and channels are still out of the builder (values render raw),
  and the Table's columns overlap at the pane's narrow width.
- **Promotion upstream** — nova's agent subpath with vex as an optional peer, or the `nisc`
  umbrella — is the owner's call; the module needs no change to move.
