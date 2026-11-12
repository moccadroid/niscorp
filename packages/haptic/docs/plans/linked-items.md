# One item per linked page: fields of several kinds, and items Read splits

Status: proposal, nothing built. Evidence: every attempt at SQLite release notes and Django linked posts in rounds A–E (`data/pilot/bench17/linked-attempts.mjs`), and offline checks `block-check.mjs`, `union-check.mjs`, `union-check2.mjs` with the throwaway `rules-proto.mjs` (no model).

## What failed

| Cause | SQLite release notes | Django linked posts |
|---|---|---|
| A field cited as lines of several kinds (paragraphs, list items, headings, links) that no one CSS rule covers; the field-rule model then failed 3 tries | 3 | 4 |
| Read split one linked page into several items ("two examples fall in one element") | 3 | — |
| Read skipped the newest post, marked "Featured" | — | 4 |
| Complete, or another failure | 4 ready | 1 ready, 1 Read failure |

On a linked page the item is the page itself: a heading and a body (Django: "the complete article body element"; SQLite: "all top-level ordered change lists"). Read cites the body as several lines, and the kinds differ: SQLite `p,li,li,li,p` (section labels and changes), Django `p,p,a,a,h2` up to 36 lines. The `a` lines are links inside a paragraph with several links, which round A's text view gives their own line.

## 1. A list field of several kinds gets one rule per kind, joined as a selector list

When the elements cited for one field are of several kinds:
- for a text field (no attribute), a cited link stands for its nearest block, using the text view's own `block()` from `lines.mjs`; a link whose block is the record itself stays a link (the field would otherwise become the whole page). A field cited for its address is never mapped;
- the cited elements are grouped by kind (tag); each group gets the rule code finds today for a list, ranked **stablest first, then fewest matches**;
- the field's rule is those rules joined: `:scope > p, ol li`. Values come in page order.

Why stablest first: ranked by fewest matches first (today's order for lists), Django got position rules (`h2:nth-child(18)`, `ol:nth-child(9) li:nth-child(2)`) that match the first post only. Ranked by stability alone, SQLite got `p, li` and with it the navigation menu's `li` items. Stable, then fewest, gives:

| Attempts (all 9 that failed on field rules or passed by the model) | Rule | Values per linked page |
|---|---|---|
| SQLite ×4 | `:scope > p, ol li` (or `p, ol li`) | 42 / 37 / 63: section labels ("prior changes from version 3.54.0 …:") and every change; the last value is the page's closing paragraph ("a complete list of sqlite releases …"); 3.54.0 has one empty paragraph |
| Django ×5 | `p, li, h2` (`p, li, h3, h2` when Read cited an h3) | 32–34 / 67–73 / 3: the post's paragraphs, list items and headings |

The field-rule model is then asked only for single-value fields.

Not chosen: **the field as one block** (the smallest element holding every cited line, one text value). It is ideal for Django (`div.blog-entry-body`, a value on all three posts) and wrong for SQLite, whose notes sit directly in `<body>`: the block is the whole page, menu included.

Rule ranking for list fields becomes one order everywhere (stablest, then fewest matches), not one for single-kind and another for mixed lists. **This is untested elsewhere:** in all 161 Read answers of rounds A–E, only these two pages ever cite more than one line for a field, so no other list field exists to replay.

## 2. Read is told when items cite the same line

In SQLite D1 and E1 (2 of 161 answers) Read gave five items that all cite line 18, the release heading, each with some changes; code later stopped with "two examples fall in one element". A line can belong to one item only, and Read can see that. Read's check adds, word for word:

```text
- Items 1 to 5 all cite line 18, and a line belongs to one item. If these are parts of one item, give them as one item; if they are separate items, cite for each only lines that belong to it alone.
```

(For two items: "Items 2 and 4 both cite line 19, …".) The condition is only "two items cite one line", so items that nest inside each other on the page never trigger it. SQLite C2 (a heading-only item and change-only items, no shared line) is not covered; it stops as today ("no candidates"). 7-Zip's earlier answers that cited one description line in three rows would get the message; no answer in rounds A–E besides D1 and E1 did.

## Not addressed

- **Django's Featured post (4 of 10 attempts):** "the three most recent" — Read takes Nov 3, Oct 26, Oct 8 and skips Oct 19 because it is marked Featured. A reasoning slip on dates; nothing here changes it. With it, Django linked posts is at most about 6 of 10.
- **Django round D run 2:** the second-level Read failed 3 tries; not read yet.
- **SQLite's closing paragraph** stays a value of the changes field; the grader checks headings only, so this costs nothing in the numbers but is noise in the artifact.
- **Nested changes repeat:** `ol li` also matches sub-items, so 19 of 42, 19 of 37 and 41 of 63 SQLite values are already inside another value's text. Today's complete runs (A2, D2) have the same duplication.
- **SQLite C2's split** (no shared line) still stops.

## Result: round F (2026-11-07, built as written, `data/pilot/bench17-runsF`)

| Round | Complete | Partial | Unusable | Stopped | Input tokens |
|---|---|---|---|---|---|
| E | 27 | 1 | 2 | 4 | 488k |
| F | **30** | 1 | 2 | 1 | 527k (15.5k and 5 s per run) |

- Django linked posts complete ×2 (`p, li, h2` on all three posts); SQLite release notes run 2 complete. Every page complete in E stayed complete.
- Luck in this round: Django's Read cited the Featured post both times (it skipped it in 4 of 10 earlier attempts); 7-Zip ×2 complete through a mapping program that filters ".exe" and then takes the first 3 rows (positional).
- New failure: SQLite release notes run 1. The first Read wrote the next level's task as "Visit each of the three linked release-note pages … and extract …"; on the linked page, where following is not allowed, Read took "visit" as an order to follow and returned nothing 3 times.
- Not complete: SQLite ×2 (JavaScript link), zlib run 1 (3 of 4, the permalink judgement), SQLite release notes run 1.

## Confirmation: round G (2026-11-07, 17 pages × 3, `data/pilot/bench17-runsG`)

Same code as F, plus the corrected retry where following is not allowed ("Give items: links are not followed from this page, so the instruction is answered from this page itself.").

- **42 complete of 51 (82%), about 28 of 34**; 42 of 48 without SQLite's JavaScript link. 834k input tokens, 16k and 5 s per run.
- Complete in all 3 runs: 11 pages. In 2 of 3: Debian, Django linked posts, Django news, SQLite release notes. zlib 1 of 3. SQLite 0 of 3.
- The failures besides SQLite are single Read slips: Debian counted 19 for 16 (2 extra rows); Django linked skipped the Featured post; Django news cited the Featured meta line as a headline; zlib had two empty model turns, then a line off by one; SQLite release notes' linked Read refused again — the next-level task named the first page's lines ("For each linked release-note page (lines 22, 24, 26) …"), and the corrected retry did not move it.

## Linked-page clause: round H (2026-11-07, the two linked cases × 3, `data/pilot/bench17-runsH`)

The linked-page context now reads: "This page is one of the pages linked from <first page>; the instruction is answered from this page itself."

- SQLite release notes 3 of 3 complete (round G: 2 of 3, the failure a refusal). Django linked posts 2 of 3.
- Django run 1: the next-level task named the first page's lines ("On each of the linked pages (lines 24, 27, and 30) extract …"); on the linked page Read cited its own lines 24, 27, 30 as three items, and code found no record rule. Line numbers in the next-level task mean nothing on the linked page, and the round G refusal had the same cause.

## Line-number check on the next-level task: round I (2026-11-07, the two linked cases × 3, `data/pilot/bench17-runsI`)

Read's check on the first page sends back a next-level task that names line numbers: "next is read on each linked page, where these line numbers mean nothing: say what to take from the page without line numbers."

- SQLite release notes 3 of 3; Django linked posts 2 of 3 — the same 5 of 6 as round H without the check.
- Django run 3: the model wrote "(lines 24, 27, and 30)" again after all three retries, and the first-page Read failed. In the other five runs the task had no line numbers from the start, so the check never fired.
- Removed again (owner's decision, 2026-11-07): no measurable gain, one run lost to it. If line numbers in the task need handling, code can delete them instead of asking the model.

## Round J (2026-11-07, 17 pages × 3, `data/pilot/bench17-runsJ`)

Two code fixes: line numbers are deleted from the next-level task (`next-task.mjs`; 6 of 41 saved tasks change), and an empty provider reply does not use up one of a model's tries.

- **38 complete of 51** (G: 42). G and J together: 80 of 102, 78%, about 26–28 of 34.
- Neither fix shows: empty replies occurred once in 51 runs; Django linked posts failed twice on the Featured skip, before any next-level task was written.
- New failures on pages stable before are run-to-run Read variance: 7-Zip run 1 cited the shared description line in all three items (the shared-line retry fired; the model sent the identical answer 3 times); Python run 2 cited "Windows installer (64-bit)" on the wrong line and repeated the identical answer 3 times though the message named line 169; GitHub run 3 cited the "?" help icon as the status. 7-Zip runs 2–3: the mapping kept older release rows.
- Pattern across rounds: the model often returns the same wrong answer on every retry, however precise the message.

## Read at high effort: round K (2026-11-07, the six pages with failures × 3, `data/pilot/bench17-runsK`)

| Six pages (Django linked posts, Django news, Python, 7-Zip, GitHub, zlib) | Read low (G + J) | Read high (K) |
|---|---|---|
| Complete | 23 of 36 (64%) | 15 of 18 (83%) |
| Runs lost to Read | 9 | 1 |
| Seconds per run | 2–5 | 6–18 (Read alone 6–18) |
| Input tokens per run | about 15k | about 17k |

- Django linked posts 3/3 (no Featured skip), zlib 3/3 (all four links, permalink included), Python 3/3, GitHub 3/3, Django news 2/3 (one Read failure), 7-Zip 1/3: both losses are the mapping step, still at low effort.

## Rendering: jsdom vs happy-dom (2026-11-07, offline on the 16 captures, `render-check.mjs`)

- jsdom running each page's own inline scripts (no network, no external script files) sets SQLite's real download links: the Linux archive becomes `/2026/sqlite-tools-linux-x64-3540100.zip` instead of the `hp1.html` decoy. 20–100 ms per page; the other 15 pages' text views stay identical.
- happy-dom did not run SQLite's timed script and parsed zlib and Python slightly differently.
- Not covered: pages built by external script files (those need fetching and running them, and a sandbox); jsdom is not a security sandbox.

## Costs and risks

- A selector list is a new rule shape for a field. Haptic's own `html.select` accepts it, `:scope > p` included (`select-list-check.mjs`): SQLite 39 / 35 / 60 values (empty paragraphs dropped), Django 32 / 67 / 3.
- Ranking change for list fields could move a list field elsewhere; the replays of rounds B–E show whether it does.
- The retry message is new model-facing text (above, word for word).
- Expected, on the saved attempts: SQLite release notes up to 5 more of 10 (3 field failures, 2 shared-line splits), Django linked posts up to 4 more of 10 (field failures), the Featured skip remaining. In a round of 2 runs each, about +2 to +3 complete. Two runs per page swing ±3.
