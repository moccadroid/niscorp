# Code writes the copy and the filter; the mapping model only where code cannot

Status: proposal, nothing built. Evidence: live rounds `data/pilot/bench17-runsC` and `bench17-runsD` (17 pages × 2, gpt-oss-120b low); offline checks `data/pilot/bench17/filter-check.mjs` and `copy-check.mjs` (no model).

## Why

In round D the mapping step (Prism's `mappingAgent`, 120b low, 4 tries) failed 6 of 34 runs and used 530k of 896k input tokens. None of the failures was about shaping:

| Run | What the mapping model did |
|---|---|
| Perl ×2 | told exactly which 9 of 12 records to keep, it blanked links, then took "the first nine records"; or misplaced a brace 3 times |
| Python run 1 | misplaced the same brace 4 times; cortex now names the stray keys, it did not help |
| Ruby run 2 | invalid JSON 3 times |
| zlib run 1 | kept only the permalink 4 times, though every message listed the cited downloads it left out |
| SQLite run 1 | (page limit; the link is set by JavaScript) |

16 of the 17 cases give no schema of their own, so their result is Read's fields copied out. Django news gives one, and Read uses its field names. The copy part of the model's programs (100–230 characters) never failed; the filter and the program's syntax did.

## The change

### 1. A stage may keep only records that contain a phrase (the filter is selection, not mapping)

The stage already drops records that lack a required field. It gains one optional test:

```json
{ "selector": "div.col-12", "fields": { … }, "required": ["title", "link"], "where": { "in": "text", "contains": "the entire book free online" }, "limit": null }
```

`in` is a field name or `text` (the record's text). The runtime keeps a record when that value contains the phrase, compared after folding case, whitespace, dashes and quotes (the fold the pilot already uses). The order is `required`, then `where`, then `limit`: "the first 10" counts records that passed the test. Records that fail it never reach the mapping, at discovery or at run time. The artifact stays data.

Why a stage field and not a `$filter` in the Prism program: Prism's `$replace` swaps literal text only, so a Prism filter cannot apply that fold, and record `text` is not whitespace-collapsed. A Prism filter would lose the fold or need a Prism change. Selection already lives in the stage (`selector`, `required`, `limit`). The cost: where the model still filters (7-Zip, GitHub), selection is in two places.

### 2. Code finds the test from the records Read cited and Jev labelled

The labels are today's: a record holding a cited example is kept, and so is one with the same values; if the reader cited every item it counted, the rest are dropped; otherwise Jev answers for each of the rest. Then code looks for one test:

- **Candidates:** runs of 1–5 words from each kept record's field values and text, with punctuation stripped at the word edges (so "online..." is "online").
- **A test must** be contained in every kept record and in no dropped record, on the same field (or text).
- **A test must reach beyond the kept values themselves.** Where every kept record holds the same value (Lua: four links to one address), any phrase of it is that value again; a phrase equal to a whole kept value is that value. Neither is a rule, and there is no test.
- **Preference:** a field (every field is one Read cited) before the record text; then the longest phrase, i.e. the wording all kept records share. A longer phrase is the label the page itself repeats ("the entire book free online"); a single word ("free") would also match a future sample-chapter description.
- **No records to drop:** no test.

Found on the saved rounds by `filter-check.mjs` (labels from the blind references; Jev matched them 83 of 83 in round C):

| Page | Test | Drops |
|---|---|---|
| Perl | text contains "the entire book free online" | 3 sample-chapter books |
| Python | name (or description) contains "windows installer" | 6 other files |
| Ruby | title (or text) contains "documentation for" | 5 other paragraphs |
| zlib run 1 (D) | text contains "zlib.net" | 3 other blocks |
| 7-Zip | none: what separates is the release table, not the row | — |
| GitHub | none: the instruction names three components | — |
| Lua | none: the kept records share one address | — |

**Where the drop labels come from.** In rounds C and D every dropped record except Perl's 3 came from "the reader cited every item it counted", not from Jev. So most tests rest on Read's count, and Jev's 83 of 83 covers the keep side. The reviewer simulated a reader who counts and cites only its first k items: 3 of 29 runs then found a wrong test (Perl k=2 "more", Python k=2 "source tarball", zlib k=5 "zlib"); the rest found none and fell back to the model, which gets the same wrong labels as today.

### 3. Code writes the copy program; the model only when the copy does not fit the schema

```json
{ "$map": { "over": { "$ref": "$.records" }, "as": "r", "body": { "title": { "$get": { "from": { "$var": "r" }, "path": ["fields", "title"] } }, "link": { "$get": { "from": { "$var": "r" }, "path": ["fields", "link"] } } } } }
```

Checked offline on all 28 single-page results of round D: it runs and matches the result schema every time, Django news' own schema included. Link-following results (SQLite release notes, Django linked posts) were not checked.

That schema check alone proves little: the inferred schema is all optional strings, and Django's own schema has no required properties, so `[{}]` would pass it too. **The copy fits only when every property of the result schema is a field of the stage and the copied values validate.** Otherwise (a value must become a number, a nested shape, a schema name Read did not use) the mapping model runs.

The mapping model (today's prompt and notes, unchanged) also runs when labels exist but code found no test. Its checks there: today's examples check (hard: a program missing a cited example is never used), then the membership message asked **once**, then a finding (round C's rule). Round D asked it on every try. Whether that made zlib run 1 worse is unproven, since all four of its messages listed the same missing cited downloads. The last program that kept every cited example is used if no later one passes.

**The checks stay on a copied result.** The examples check, the label comparison and the "N items, the reader counted M" finding run on it as on a model's result. On the discovery page a code test matches the labels by construction, so the count finding is what still shows a wrong label.

## What it should change, and what not

- From round D: Perl ×2, Python run 1, Ruby run 2, zlib run 1 no longer meet the mapping model → +5 if their Read and lists hold. From round C: Ruby run 1 (+4 rows) and Perl run 1.
- Mapping tokens: the model would run on 7-Zip, GitHub and Lua when they need filtering (about 6 of 34 runs) instead of 29 of 34; about 530k → roughly 100k per round.
- Not touched: Read mistakes (Django's Featured post, release notes items), 7-Zip's release tables, SQLite.

## Costs and risks

- **A new stage field** (`where`). One test, one phrase, positive only; no "and", no "not". 7-Zip and GitHub stay with the model.
- **A wrong label makes a wrong test, silently.** Today a wrong label only produces a retry message. Most drop labels come from Read's count, not Jev (above). What remains: cited records are always kept, a test must keep every one of them, and the count finding.
- **A phrase can be today's page only.** zlib's "zlib.net" is one: it is the mirror label "US (zlib.net)" plus the permalink's own text, a one-word test on record text; the link field cannot separate (the FAQ links are on www.zlib.net too). The longest-shared-phrase rule prefers the page's own repeated wording, but no check proves a phrase holds on the next version of a page.
- **Two runs per page swing about ±3 complete**, so one round will not prove it.

## Result: round E (2026-11-07, built as above, `data/pilot/bench17-runsE`)

| Round | Complete | Partial | Unusable | Stopped | Input tokens | Per run |
|---|---|---|---|---|---|---|
| D | 20 | 2 | 1 | 11 | 896k | 26k, 7 s |
| E | **27** | 1 | 2 | 4 | **488k** | **14k, 5 s** |

- Code wrote the program in 24 runs; the mapping model ran in 6 (7-Zip, GitHub, Lua: labels but no phrase). Mapping tokens 530k → 114k.
- Phrases found: Perl "the entire book free online", Python "windows installer", Ruby "documentation for", zlib "zlib.net". All 8 runs complete.
- Not complete: SQLite ×2 (link set by JavaScript), SQLite release notes ×2 (one note cited as several items; changes field mixes headings and list items), Django linked posts ×2 (field rules for the mixed body; Read skipped the Featured post), 7-Zip run 2 (+4 rows from older release tables).
- Rough comparison: the old pipeline scored 24 / 4 / 2 / 4 on 2026-11-03 pages with its own grader, at about 100k input tokens and 48–85 s per discovery.
