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

## Rounds 2 and 3 (2026-10-19): a stricter suite, harder screens, 120B

**Why.** The owner asked whether the results above were correct. They were not, fully: "built and
live" counted screens that showed rows, not screens that showed the right rows. The owner then
chose GPT-OSS 120B as the builder's model (qwen cost more than ten times as much), so round 3 is
measured on 120B only.

**The suite now judges the rows** (`96df97a4` and later): each screen's rows against SQL under the
caller's scope (tasks are alex's), by id or by title and date, in the order asked for with ties
allowed, with the values a row must carry, money near the stored dollars, and no column that draws
empty. Five harder screens joined it (a dropdown loaded from data, two filters at once, tabs, a
checkbox, a row click that narrows a second table), and four held-out screens are scored but are
not meant to be read to change the builder (`62a24717`). Paging was dropped: vex's queries take a
limit and no offset. The old oracles were wrong in two places: search counted names only, and
tasks were counted unscoped (the week screen's 21 is alex's; 31 is everyone's).

**What the harder tests found, and what changed**

| found | change |
|---|---|
| tabs wired as an input passed their probe and did nothing live | components declare what they send in their own `events` metadata (`9b5b3bc7`); the palette prints it, and a ui:model trigger or a `set` probe on a component that sends none is refused |
| a column bound to a key the rows lack drew empty | the kit says which keys a list reads; the check names the missing ones |
| a filter key the query does not take, or a search pattern sent empty, changed nothing | prove notes it; the check refuses it |
| an empty optional filter matched nothing | the check names it after the mount; the guide shows the null idiom |
| a screen with a Checkbox rendered COMPONENT_NOT_FOUND live | relay's shell declares its kit by name (`dc12bd1d`) |
| Groq 429s failed builds | relay's Groq client waits the time Groq names (`d755caea`) |
| a header sort or a cell toggle demanded probes the check cannot click | probes are demanded only for what the check can reach |
| "today plus 7" could not be expressed, so dates were frozen | a literal ambient value is refused, and prism's `$dateAdd` is shown |
| 120B formatted $36,000 as "$360.00" | relay shows money as stored; prism's money op reads cents by default |
| a query that did not answer the request (a lost "open" filter) passed | probes carry row claims (`holds`), checked on the loaded rows (`50042e9b`) |
| Groq refused near-miss tool calls with no word on what missed | the check tool reads its probes itself and names the wrong field (`7212b76f`) |
| a claim that ordered a formatted date ("Jan 5, 2027") read as rows out of range | the finding names the formatted value (`90738aeb`) |
| pick-then-show screens that were right hit the step limit: the detail list was "empty at open" though nothing had called it, and a Select's rows counted as shown by nothing | an endpoint only a trigger calls loads when used; one no step calls is still named; rows any component shows count as shown (`c65fab4e`) |
| 120B put `probes` inside the action, and "Unrecognized key" did not tell it where they go | the finding says they go beside it (`c65fab4e`) |
| tabs probed with `{ "click": ref }` and no tab: the click carried nothing and the finding blamed the transform | a click on a component whose ui:click declares a payload needs a value (`dcec5bb4`) |

**Tried and reverted.** Checking an answer that carries the screen like a call to check
(`91041a1f`, reverted in `6fe80562`): a repeated identical check call ends the run and gets the
repair, but nothing stopped a model that answered the same broken screen again; one build retried
23 times, and the pass fell from 12/19 right to 9/19.

**Generality.** The module names no relay concept. Relay's part is its kit: the offered components,
house rules, catalog, four examples, and what its components send. The examples moved to screens
the suite does not test (`2dab8d30`): before, the month picker and the date range mirrored two
suite intents. The check rules added in round 3 read the component's own metadata (a declared
click payload, the events it sends) or the action itself (lifecycle.mount, a trigger's calls), not
relay's components by name.

**The holdout is no longer clean for two classes.** Diagnosing the step-limit builds meant reading
the traces of two held-out screens (a company's contacts, activity tabs) beside the suite screens
with the same failure (a company's deals, status tabs). The fixes are motivated by the suite screens,
but those two holdouts now measure fixes made with them in view.

**The artifactory, through the real session** (`artifactory-walk`, 120B): built and placed a screen,
kept it, reloaded, edited it in place (a new column), kept the edit, reloaded again with the edit
there, built a second screen and discarded it, and it was gone after a reload. All eight checks pass.

**Measured** on 120B, each pass on the code as it stood (19 screens: 10 core, 5 hard, 4 held out):

| pass | code | effort | built | right | core (10) | hard (5) | held out (4) | stuck at a limit |
|---|---|---|---|---|---|---|---|---|
| 1 | `7212b76f` | medium | 14 | 12 | 9 | 2 | 1 | 5 |
| 2 | `91041a1f`, answers checked | medium | 13 | 9 | 7 | 1 | 1 | 6 |
| 3 | `6fe80562`, reverted | low | 9 | 6 | 5 | 1 | 0 | 10 |
| 4 | `dcec5bb4` | medium | 13 | 11 | 9 | 0 | 2 | 5 |
| 5 | `dcec5bb4` | medium | 16 | 12 | 8 | 3 | 1 | 3 |

"Right" counts screens whose rows match the oracle; the set columns count right screens. "Stuck"
counts builds that ended at the step limit or on a repeated call. One pass-4 failure was a Groq
parse error six seconds in.

**What the passes say**
- 120B stays at medium effort: low was worse on every set, and on the hard screens it answered
  without calling check 13 to 25 times per build.
- The fixes in `c65fab4e`..`dcec5bb4` removed the false findings that stalled pick-then-show and
  tab screens (status tabs built right for the first time in these passes), and builds stuck at a limit
  fell to 5 and 3. The right count did not move beyond noise: 11 and 12 against 12.
- What stalls the rest is the model sending the same call after a finding that names the fix (the
  tabs finding named the missing "to" three times; probes set a data key instead of the ref four
  times), and query choices no check can judge: counts of "won" in a column that holds stage
  names, 0 in every row of its own sample; a lost "open" filter; a limit the request never asked
  for.

**Open**
- **A probe that sets a data key instead of the ref** ("companyId" is what "companySelect" writes):
  the coverage finding could name the ref. Not built.
- **A row click in a probe whose list loads only after a pick**: "no rows to click" could say to
  pick first in the same probe. Not built.
- **A column that is 0 in every proved row**: a prove note beside the no-rows note; the won/lost
  screen shipped counts that were 0 in every row of its own sample. Not built.
- **120B answers with the screen instead of calling check** (39 to 193 refused answers per pass):
  checking the answer needs the repeat stop that check has. Not built; pass 2 shows the cost
  without it.
- **The suite logs a refused answer by its message only**; logging the answer would tell prose
  from a screen.
- **Package proposals, the owner's call**: vex's 100-row cut as a structured flag, not a warning;
  prism's money op naming the unit it reads (cents, unless told), so stored dollars are not divided by 100; distinct values in discovery, so a filter value is
  read, not guessed.
- **A second app** (lyceum) needs the module where both apps can import it: promotion is the
  owner's call.
- Nothing is pushed.

## Round 4 (2026-10-19): three more findings, a repeat stop, and the sampling defect

**Built.** On the owner's go for the three findings above (`ba5326b0`): a probe that sets a data
key is told the ref that writes it; a row click on an empty list names the controls that fill it;
prove notes a column that is 0 in every row. In one won/lost build the note led 120B to prove the
rows without its condition, read the stored stage names, and count "Closed Won". Then checking the
answer again, with a stop when the same screen comes back three times in a row, to check or as the
answer, and a fresh count for the repair (`0c48ea9b`).

**The sampling defect.** A high-effort pass built 6 of 19 screens, with 208 turns that "produced no
output". Groq's raw replies showed each such turn ended with `finish_reason: "length"` at exactly
3,072 completion tokens, all of it reasoning: relay sent no `max_completion_tokens`, and Groq's
default is 3,072. Replayed with 16,384 and 32,768 tokens, the same turn still never answered: at
temperature 0, set in round 1 to steady the runs and measured then only at medium, gpt-oss's
reasoning repeats one sentence until the budget runs out. At temperature 1, OpenAI's setting for
gpt-oss, the loop breaks. Relay now runs 120B at temperature 1 and top_p 1 and gives every Groq
turn 16,384 completion tokens (`c74b80a7`). Every 120B pass before it ran with this defect; medium
lost 2 to 6 turns per pass to the cap.

**Measured** on 120B, 19 screens:

| pass | code | sampling | effort | right | built | core | hard | held out | stuck | time |
|---|---|---|---|---|---|---|---|---|---|---|
| 6 | `ba5326b0` | temperature 0 | medium | 13 | 15 | 9 | 3 | 1 | 4 | 27.7 min |
| 7 | `ba5326b0` | temperature 0 | medium | 13 | 16 | 6 | 4 | 3 | 3 | 27.4 min |
| 8 | `ba5326b0` | temperature 0 | high | 5 | 6 | 5 | 0 | 0 | 13 | 50.5 min |
| 9 | `0c48ea9b` | temperature 0 | medium | 11 | 12 | 7 | 4 | 0 | 7 | 21.2 min |
| 10 | `c74b80a7` | temperature 1, budget | high | **16** | 18 | **10** | 3 | 3 | 1 | 26.0 min |
| 11 | `c74b80a7` | temperature 1, budget | medium | 12 | 14 | 7 | 3 | 2 | 5 | 20.7 min |
| 12 | `c74b80a7` | temperature 1, budget | medium | 12 | 16 | 8 | 2 | 2 | 3 | 15.2 min |

The median build took 56 s on high against 29 and 51 s on medium. The token counts the suite logs
are cortex's estimates and leave out reasoning, so they say nothing about what high costs.

**What it says**
- High, with the defect fixed, is the best pass of all four rounds: 16 of 19 right, every core
  screen right, one build stuck. Its misses: the drill-down shows all 120 deals before a click where
  the request asks for the 82 open ones, the hide-closed screen ran out of steps, and one held-out
  dropdown did not offer the company the suite picks.
- Medium at temperature 1 is no better than at temperature 0: 12 and 12. It still sends the same
  screen back after a finding often enough that the repeat stop ends 3 to 5 builds a pass; high
  sent back the same screen in none.
- The repeat stop's cost at temperature 0 (pass 9) came from greedy decoding: given nearly the same
  context, the model wrote the same screen.

**Open**
- **High as the default effort** for the builder: the owner's call; one line in relay's model table.
- **A step value written as a transform op** (`{ "$ref": "$.companies[0].id" }` in a set step):
  nova resolves the strings inside it, so the request sends `{}` and vex answers 500. A check could
  name it, like a transform op in a layout prop. Not built: it was not in the approved list.
- The suite's usage counts leave out reasoning tokens; Groq's own counts arrive in the stream.

## Round 5 (2026-10-19): what a build costs, vex measured alone, four more fixes

**Measuring.** The suite now records every model turn — its time, how it ended, and the provider's
token counts — for the builder and for vex's query writer and shape mapper (`3ca70e3e`,
`c5edee2b`). Groq reports counts on every turn it answers, reasoning included; only turns it
rejects are estimated. A run longer than 30 minutes used to die: moss ends a session no socket
holds after 30 idle minutes, and the suite's never holds one; it now signs in again (`d3e28da7`).

**Built** on the owner's go (`a075fb98`, `3cb978e3`): a transform op in a step's value is named
before the mount; after the mount each request is replayed and vex's own `missingContext` is named
(discover's signatures do not say which keys are optional); the guide shows a switch sending the
filter's value or null; the screen builder runs at high effort, vex's roles stay at medium.

**Measured** on 120B, 19 screens, everything a run spends — the builder's turns and vex's:

| run | effort | right | built | core | hard | held out | stuck | time | input | output | cost |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | high | 15 | 17 | 8 | 3 | 4 | 2 | 31.8 min | 4.78 M | 0.62 M | $1.09 |
| 2 | high | 16 | 17 | 9 | 3 | 4 | 2 | 30.5 min | 5.07 M | 0.57 M | $1.10 |
| 3 | medium | 11 | 12 | 7 | 2 | 2 | 7 | 21.0 min | 6.86 M | 0.40 M | $1.27 |

Costs at Groq's list price for gpt-oss-120b ($0.15 per million input tokens, $0.60 per million
output). Nearly all of a run's time is model turns: in run 2, 23.8 minutes the builder's and 6.6
minutes vex's; the check itself takes a fraction of a second. vex spends 40 to 50% of the input
tokens. High takes about 1.5 times as long per run as medium and costs less, because it takes fewer
steps: per right screen, about $0.07 and two minutes on high, $0.12 and two minutes on medium.
The fixes did not move the count (15 and 16 against 16 before them); the held-out screens were 4 of
4 in both runs, and the new findings fired in 1 to 4 builds a run.

**vex alone** (`c813c840`): 55 of the builder's own queries, each twice at medium and twice at high,
each in a fresh cache. At medium 101 of 110 answered, at high 101; Groq rejected 18% and 24% of the
query writer's turns (cortex recovers them); high cost 40% more and took nearly three times as long
per query. Which rows a query returns is steady: every query both efforts answered had the same
row count, and the samples compared row by row had the same ids. The formatted fields are not: of the answers with a display field, the
shape mapper wrote the formatted value over the stored date in about a quarter (9 of 42 at medium,
11 of 43 at high) and left the display field unformatted in a third (14 and 18). The same query
answered twice gave different formatted fields in 27% of cases at medium and 15% at high. vex stays
at medium.

**Open**
- **A proof's context value that is a type description** (`"status": { "optional": true, "type":
  "string" }`): the hide-closed build sent it for many proves instead of a value; prove could refuse
  it and say to send the value, or null. Not built.
- **Formatting outside vex**: ask vex for stored values only and format in the endpoint transform
  with prism, so a model never writes a display field or overwrites a stored one. A change to
  relay's house rule; the owner's call.
- **vex's shape mapper**, the owner's call: never write over a stored column; format dates in the
  query language rather than in a model-written mapping.
- **`assign()` ignores a role's own effort**: choosing a model without an effort falls back to the
  model's default, so the builder would run at medium. The suite passes the effort.
