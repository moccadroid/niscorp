# Haptic: the same answers for fewer tokens and seconds

Status: built 2026-11-12 on branch `haptic-efficiency` (off `haptic-rebuild` 858f0d66), all three changes, measured live; results under "Built and measured" at the end. The proposal below was reviewed once (NO), corrected, re-reviewed. Every number here comes from the saved runs (`data/bench/core-heldout`, `core-tuned`) replayed with their recorded model answers and no model call. The scripts are in `data/compare/harness/` (the Prism description size: `prism-doc-size.mjs`) and the reviewer's in `data/compare/review/`. Token counts from characters use 4 characters per token. Nothing in the package is changed.

## Why this

| Held-out, 11 sites × 3 (PyPI left out) | Complete | Input tokens per discovery | Median time | Reusable |
|---|---|---|---|---|
| Haptic | 22/33 | 96k | 24 s | yes |
| ScrapeGraphAI | 6/33 | 16k | 3 s | no: the model reads the page on every run |
| Crawl4AI | 10/33 | 27k | 5 s | yes (a CSS schema) |

Complete counts are graded one-to-one: each result item answers at most one reference item (`benchmarks/grade.ts` since 2026-11-12). The earlier grader counted a reference item as found when any result item contained its text, so one ScrapeGraphAI item holding every answer as text counted as complete; under that rule ScrapeGraphAI had 19/33. Haptic's and Crawl4AI's counts are the same under both rules. PyPI stays out of every comparison: its captured page is a bot check, its reference list is empty, and an empty or one-item result grades as complete. Crawl4AI's `[]` and ScrapeGraphAI's `"NA"` count as complete there for that reason, not because they found the version.

Reading the page is not the difference: Haptic's Read costs about what the others' one call costs. The difference is what Haptic adds after it. Per held-out discovery:

| Part | Tokens | What it is |
|---|---|---|
| Read (120b) | 17k | the page's text view, retries, both attempts |
| Mapping agent (120b, Prism's published agent) | 24k | 2.2 tries per run; every try carries Prism's description of its mapping operations, 28,333 characters (about 7k tokens) |
| Field rules (120b) | 0.7k | rare |
| **Jev labels** | **54k** | one `decide` call per record Read did not cite: 2,522 calls in 33 discoveries, 706 tokens each; Node.js alone makes 394 |
| of all the above: the second attempt (high effort) | 37k | 20 of 33 discoveries; 16 of the 20 because the result disagreed with Jev's labels |

Time: the first attempt takes 9 s on average. A second attempt, where there is one, takes a median of 28 s and a mean of 32 s (18 s averaged over all 33 discoveries). One run, where the computer slept during a call, is left out of these times.

## Change 1: record rules anchored on a unique element

**The failure.** DigitalOcean's status page has 17 groups built alike. The rows of the Managed Databases group differ from the other groups' rows only in what comes before their container: the group's header. Today the rule finder writes rules from the cited rows' own tags, classes and positions and from their parent. It never uses an attribute's value, and it never looks at an ancestor's neighbour. So the best rule matches the rows of all 17 groups: 228 records for 14 answers. Jev labels and the mapping agent then try to filter 228 records back down by their text, which cannot work, because the group's name is not in the rows' text. Crawl4AI's model sees the HTML and writes `div[data-component-id='kl8qv98c9brp'] + .child-components-container …`, which gives all 14 regions in 3 of 3 runs.

**The change, in two parts.**
- **Anchored candidates.** The rule finder also offers record rules anchored on an element that has an `id` or a `data-*` value found exactly once on the page. The element is either an ancestor of the cited record, up to 4 levels up, or the element just before such an ancestor. Example from the DigitalOcean page: `div[data-component-id="kl8qv98c9brp"] + div div`, 15 records (the 14 regions and Global). The 4 levels bound the extra search; the measured changes needed at most 3.
- **Lists that agree on their first records are one option.** Today two lists count as different whenever their record counts differ, even when the instruction's limit means a run keeps the same records from either. With a limit, lists whose first `limit` records on the page discovery read are the same become one option, and the stablest rule stands. An anchored rule counts as less stable than an unanchored one. Without this part, Wikipedia would switch to an anchor (74 rows → 73) for nothing: the limit of 10 gives the same 10 records either way.
  - **Where this is not exact:** the comparison uses the page discovery read, before any phrase filter. If the phrase filter found later drops some of those first records, a run refills from later records, and those can differ between the two lists. The same goes for the other pages of a level with several pages. In both cases the stablest rule still stands, but its output can differ from the list it replaced. It made no difference in the saved runs (Wikipedia has no phrase filter).

**How a list is then chosen (unchanged).** Lists are first told apart by their first records. Among the distinct lists, the one nearest Read's count wins, with ties going to the fewest records. Stability decides only between lists that keep the same records. When Read gives no count (14 of 120 saved Read answers), the list with the fewest records wins, so an anchored subset wins outright whenever it still contains every cited example.

**Measured: the choice, on every saved attempt of both sets (104 choices).**
- The same-records rule alone changes none of today's choices.
- With both parts: 85 choices unchanged (so those outcomes are unchanged), 19 changed on 4 sites. Wikipedia keeps today's rule. Without the same-records rule, 24 changed, including Wikipedia's switch to a generated id for no gain.
- Each changed list, on the records the attempt actually chose:

| Site (choices) | Read's count | Today | Changed | Reference answers |
|---|---|---|---|---|
| DigitalOcean (4) | 14 | 228 records | 15 | 14/14 in both |
| Node.js (6) | 66 | 212 records | 69 | 66/66 in both |
| Ruby, tuned set (3) | 3 | 8 records | 6 | 3/3 in both |
| jQuery UI (6) | 9 | 68 records (`h2`) | 67 (`div[id="content"] a`) | 9/9 in both |

DigitalOcean and Node.js are real reductions: Node.js asks Jev about roughly 130 fewer records per attempt. Ruby is small. jQuery UI is not a real reduction: one record fewer, read from the link instead of the heading. What labels, the program and the grade then do can only be measured live, because the saved Jev answers do not fit the new records.

**Cost and risk.**
- **Time:** more candidate rules to check. On curl's long table, which already takes about 40 s of code, the extra time must be measured before this ships.
- **Values the site rebuilds:** an anchor on a value the site regenerates fails in one of two ways:
  - The value disappears: the run reports `broken` (a page without records).
  - The value moves to another element: the run can **silently return wrong records**. Wikipedia's ids such as `mwqg` are generated counters that can land on another element after an edit. With the same-records rule, Wikipedia's rules no longer use that anchor, but another site's could.
- **Single pages get no cross-check:** most levels have one page, so nothing checks that an anchor value means the same thing elsewhere. A level with several pages requires the rule to match on every page.

## Change 2: Jev labels records in batches

**Today** (approved text): one `decide` call per record; `state = { instruction, examples, record }`; one question named `answers`:

> instructions: "The examples are items a reader picked from a web page as answers to the instruction. Is the record also one of the items the instruction asks for?"
> criteria true: "The record is one of the items the instruction asks for." · false: "The record is something else on the page, or something the instruction excludes."

Measured over today's 2,516 replayable calls:
- The record being judged: 140 characters, about 35 tokens.
- The five examples: 578 characters, about 145 tokens.
- The instruction, the question and TypeSafe's framing: the rest, about 525 tokens (inferred: 706 minus those two).

So about 670 tokens of every call are the same in every call of a level.

**Proposed** (new text, word for word, for approval): one `decide` call per batch of up to 25 records. `state = { instruction, examples, records: { r1: { fields, text }, …, r25: … } }`, each record shown as today. One question per record, named by its key:

> instructions: "The examples are items a reader picked from a web page as answers to the instruction. Is the record `records.r1` also one of the items the instruction asks for?"
> criteria true: "The record is one of the items the instruction asks for." · false: "The record is something else on the page, or something the instruction excludes."

The question changes in one place only: "the record" becomes "the record \`records.r1\`", the way the approved image-challenge question names its tile ("Does the picture in \`tiles.{id}\` …"). The criteria are the same. The state changes too: Jev now sees up to 25 records side by side instead of one. Signal sends all questions in one request and decides each with its own rule (`answer` is `noul ≥ 0.5`), as today.

- **Estimated saving (inferred, not measured):** about 120 tokens per record instead of 706 (its record 35, its question about 60, its share of 670 across 25), so about 80% of Jev's tokens, if TypeSafe bills a 25-question request by its size the way it bills a one-question request. That is unknown.
- **Time (inferred):** today 6 calls run at once; batching makes 1 call where there are 25. Whether a 25-question call answers as fast as one question is unknown.
- **The cap:** 250 Jev calls per attempt becomes 250 labelled records per attempt. The cap protects cost, and cost follows records.
- **Risk:** one call answering 25 questions may answer them less independently than 25 calls do (one record's answer influencing the next).
- **Measured before building, for the owner to judge:**
  - every saved held-out record and its examples (2,516 single answers) asked again in batches of 25;
  - a baseline: a sample of 300 of them asked again one by one, as today, so that Jev's own run-to-run variation is known;
  - agreement record by record, plus tokens and time for both.
  - Cost about 300k Jev tokens for the batches and about 210k for the baseline.

## Change 3: the mapping agent is told only the operations its job needs

**Today.** Prism's published mapping agent does not describe Prism's whole grammar (75 operations). It describes its own "mapping" profile, 55 operations, built with Prism's public `getProfileJsonSchema(MAPPING_OPS, 'draft-7')`. Cortex sends that description with every try: 28,333 characters, about 7k tokens, beginning "OUTPUT SCHEMA — your output MUST validate against this JSON Schema:". Programs are checked against the full grammar (`ConfigSchema`), not against that description.

**Measured.** The 39 programs the mapping agent wrote in the saved runs (both sets, every answer in the events) use 20 of the 55 operations:

> `$var` 180, `$get` 172, `$contains` 49, `$const` 42, `$eq` 41, `$map` 39, `$ref` 39, `$filter` 34, `$not` 22, `$neq` 15, `$and` 12, `$or` 11, `$gte` 7, `$unique` 5, `$slice` 4, `$toNumber` 4, `$merge` 2, `$split` 2, `$with` 1, `$take` 1

None of the 35 others appears: no arithmetic, dates, locale formatting, `$case`, `$groupBy`, `$interpolate`, `$join`, `$reduce`.

**The change.** Haptic gives the same published agent (its instructions, its input, its check against the full grammar) a description built by the same Prism function from a shorter list. The list follows one rule: **the agent's job is to read, filter, compare, compute and shape record values into the caller's schema, so every operation that does that stays; operations that format values for display, and the general fold, go.** Out, 4 operations: `$localeDate` `$localeMoney` `$localeNumber` (display formatting) and `$reduce` (a general fold, which the list operations already cover). The other 51 of the 55 stay, including `$join`, `$interpolate`, `$toString` and `$case`, which a caller's schema can need: one string from several lines, a number into a text field, a status mapped to a value. A program that uses one of the 4 is still accepted; the agent is no longer told they exist.

The description keeps Prism's wording: the same heading, then the JSON Schema `getProfileJsonSchema` generates for the 51 operations, each operation's own description unchanged. It is 23,057 characters instead of 28,333. Prism is not changed: Haptic passes `output.doc` (an option of cortex's agent definition) when it runs the agent, and programs are still checked against `ConfigSchema`.

- **Measured saving:** about 1,300 tokens per mapping try. The held-out set made 74 tries in 33 discoveries, so 3.0k per discovery (3% of 96k). The tuned set made 21 tries in 51 discoveries, so 0.5k per discovery.
- **Why so little:** a list fitted to the 39 programs the agent wrote would save more. The 20 operations they used take 10,146 characters with the heading. But such a list fits only the pages we measured. Most of the description is the operations a schema-shaping program may need, and they stay.
- **Risk:** a shorter description may change how well the agent writes programs. Only the bench measures it.
- **The larger lever is outside Haptic:** each operation's description in Prism is long. Each of the 3 locale operations, described alone, takes about 2,000 to 2,700 characters. Making those descriptions shorter would be a case for Prism.

## Measured and not proposed

- **Escalating only on a stop or a missing cited example** (not when the result disagrees with Jev's labels):
  - Held-out: 20 complete instead of 22, 67k tokens instead of 96k, median 10 s instead of 24 s.
  - The label-triggered second attempts buy 4 completes (HAProxy, jQuery UI twice, PostgreSQL), lose 2 (nginx twice), and lift Wikipedia runs 1 and 2 from unusable to partial, for 29k tokens and 14 s at the median.
  - One replay differs from the saved run: DigitalOcean run 1's first attempt replays as unresolved, but it was ready (partial) and was the result kept. Complete counts are unaffected; partial and unresolved are each off by one in the first-attempt-only figures.
  - Changes 1 and 2 reduce the label noise that triggers most of these attempts, so this trade should be measured again after them (decision 2).
- **A second phrase test** (a phrase every dropped record contains): on 36 labelled levels it exists 3 times, and each time it is a value of today's page ("101" on Wikipedia), so it would overfit. Not proposed.
- **Describing only the operations our programs used**, or a list without a stated rule (an earlier draft of change 3 had 42 operations, 18,811 characters, 5.3k saved per held-out discovery): either would save more, but it would leave out operations a caller's schema can need (`$join`, `$interpolate`, `$toString`, `$case`). Not proposed.

## Gates

Both sets live once, after all three changes, on the same captures:

| Set | Complete | Input tokens per discovery (120b + Jev) | Median time |
|---|---|---|---|
| Tuned, 17 × 3 | ≥ 47/51 | ≤ 16k | ≤ 5 s |
| Held-out, 11 × 3 | ≥ 22/33 | ≤ 55k | ≤ 24 s |

- **Tuned:** today is 48/51, 16.4k and 4 s, from one round on this code (`core-tuned`). How much a round varies on this code is not measured (the earlier pilot rounds ran other code), so the one complete and one second of slack are a choice, not a measurement (decision 4). The changes are not expected to help here: the tuned pages have little labelling.
- **Held-out tokens:** Jev from 54k to about 11k by change 2, and less again where change 1 shrinks the lists. 120b from about 42k to about 39k by change 3. That gives about 50k (estimated). The gate stays at 55k, leaving room for the estimate to be wrong.
- **Held-out time:** no worse than today. The time saving depends mostly on decision 2.

## Decisions

1. **The batched Jev question as written above** (the record named by its key, criteria unchanged), and the measurement before building it: about 510k Jev tokens.
2. **Escalation:** keep today's rule (recommended until changes 1 and 2 are measured), or escalate only on a stop or a missing cited example. On today's numbers that is −2 completes, −29k tokens and −14 s.
3. **Anchors on attribute values:** accept that an anchored artifact can return wrong records without reporting `broken` when the site moves a generated value to another element, as Wikipedia's ids can.
4. **The tuned gate:** allow one complete and one second below today (≥ 47/51, ≤ 5 s), or require no change (≥ 48/51, ≤ 4 s) and accept that one round may miss by chance.
5. **Change 3 — decided by the owner 2026-11-12: keep it.** Describe 51 of the 55 operations, leaving out the 3 display-formatting ones and `$reduce`, for about 3k tokens per held-out discovery.

The owner, 2026-11-12: "go with what you suggest". Taken as: 1, the question as written, built without the 510k-token measurement (the bench measures the outcome); 2, today's escalation rule kept; 3, the risk accepted; 4, the looser tuned gate (≥ 47/51, ≤ 5 s).

## Order

1. Change 1 in the package. The 90 saved pilot runs and the 4 replay fixtures must replay unchanged except where the list choice changes. Measure the rule finder's time on curl.
2. Change 3 in the package (it needs no measurement before building: only the bench can show its effect).
3. The measurement for change 2; the owner decides on it.
4. Change 2.
5. Both sets live, against the gates above.

## Built and measured (2026-11-12)

One live round per set on the same captures: `data/bench/eff-tuned`, `data/bench/eff-heldout`, against today's `core-tuned`, `core-heldout`. Costs from `data/compare/harness/round-cost.mjs`, outcomes from `pnpm grade`.

| | Complete | Tokens per discovery (120b + Jev) | Median time | Second attempts |
|---|---|---|---|---|
| Tuned, before → after | 48 → **49**/51 | 16.4k → **15.9k** (Jev 3.1k → 1.2k) | 4 s → 4 s | 6 → 9 |
| Held-out, before → after | 22 → **23**/33 | 96k → **37k** (120b 42k → 30k, Jev 54k → 7k) | 24 s → 20 s | 20 → 13 |

All six gates pass. The one-to-one grader gives the same counts for both rounds of both sets. The held-out estimate was about 50k; the measured 37k is lower because change 1 cut the lists Jev labels and the label disagreements that trigger second attempts (20 → 13).

Per held-out site, tokens per discovery: DigitalOcean 193k → 17k and **3/3 complete** (was 0/3, all partial with 44–59 extra records); Node.js 330k → 48k (still 3/3); nginx 70k → 10k (19/19 answers in every run, 2 extra records each, partial as before); PostgreSQL 49k → 25k; jQuery UI 158k → 75k.

**Worse:**
- **Wikipedia: 0/3 usable** (was 2 partial, 1 unresolved). Read cited the building's link address where the name was asked in 6 of 6 answers (before: 3 of 5), so the names came out as addresses. Read's text and input are unchanged, and the list and section are the same as before, so this is Read's variance on a known failure ("Valid but wrong answers" in STATUS.md), not one of the three changes.
- **jQuery UI: 1/3 complete** (was 2/3). In 2 runs the mapping agent did not write a working filter for the version numbers in either attempt: variable scope and `$map` shape mistakes, as in today's failed run. One round cannot tell whether the shorter description (change 3) or chance did it; none of the mistakes involves the 4 operations left out.
- **USENIX run 2 unusable** (Read's answer), HAProxy run 3 partial (2/3): single-run swings of the kind the earlier rounds showed.

**Change 1, replayed** (`choice-recheck.mts`, every saved attempt through both codes): 19 of 116 attempts choose another list, the same 19 as measured above. Code time: curl's attempts 104 s → 108 s, Fly's 15 s → 19 s per attempt (more candidate rules to check). The live held-out round started while this replay was still running, so its Fly time (33 s) is not the code's alone.

**Change 2:** the four saved replays pass with batched decisions; one new test checks that 30 open records go out as 25 and 5 questions with matching keys. Jev's time on jQuery UI fell from 21 s to 1 s per discovery.

**Not run:** `pnpm check:grammars` in the new worktree (it needs the other packages built; the grammar is unchanged). The 510k-token agreement measurement was not run.

**The changed names:** the profile option `maxJevCalls` is now `maxJevQuestions` (one per record labelled or section chosen); `Calls.decide` takes a map of questions and returns a map of answers.
