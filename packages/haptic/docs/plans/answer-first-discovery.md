# Haptic discovery: the model answers, code finds the rules

Status: proposal. It would replace the Discovery section of `typescript-rebuild.md`. The artifact, the runtime (`walk`), search and the Prism mapping stay as written there. Nothing is committed.

## Position

Stop asking a model to write CSS over page HTML. Split discovery into steps that are each one small, checkable question, and let code do the structural work:

1. **Read** (model): read the page as numbered text lines and answer the instruction with a few example items, citing the line of every value.
2. **Candidates** (code): find every CSS rule that reproduces all the examples on the page.
3. **Item** (model, a choice): "which of these is one item?" The options are the first example's text at each candidate level (inner block, whole teaser, whole section…).
4. **List** (model, a choice): "which of these is the list you meant?" Options are the remaining candidate lists, each shown by its first N records as text.
5. **Map** (Prism's agent, 120b low, unchanged).
6. **Check** (code): the result holds every example, field by field, and `count` when given.

The model does what the pilots show it does willingly, answering, plus two choices among real options. Code does the part models did badly: turning examples into rules. That part can be tested on saved pages with no model at all.

**Cost:**
- **Code:** rule-finding, about 300 lines; the prototype is about 190.
- **Prompts:** four new prompts (Read, Item, List, and Fields when code finds no field rule), which you approve word for word.
- **A known limit:** values shown only in attributes (`datetime`, `alt`) are not in the text view.

## The smaller alternative, and why not

The pilot evidence for the current design (a rules agent that reads prepared HTML and writes selectors) is mixed, not all bad:

| Case | Rules agent result |
|---|---|
| Django | 2 of 2 exact, 24k tokens |
| Spiegel | the right data in all 4 runs that reached it. In round 2, 1 step and about 85k tokens; in round 1, 6–8 steps and 266–303k tokens |
| SQLite | 0 of 6. The causes: my schema writer twice; my harness's schema description (round 2); one inspect loop on a fully shown page (round 1, run 2); nested lists the selectors can't produce |
| Round 2 overall | every run that ended without data failed in the schema step, and one of those came from my harness telling the model the answer was `{type: string}`. SQLite runs 1 and 4 reached data and still missed |

The smaller fix is: drop the schema writer, infer the schema from the probes, keep the rules agent. It would likely pass Django and Spiegel. I don't recommend it, for three reasons:
- **The hard step stays a big open question.** The rules agent writes selectors over 30–96 KB of HTML per step. When it goes well that's 1 step; when it doesn't, 6–8 steps and up to 300k tokens. Its failures can only be worked on with paid model runs.
- **Answer-first moves the hard part into code.** Code can be tested on every saved page, deterministically, for free. The model questions left are small and checkable, which is the nisc thesis.
- **The models keep answering with data when shown a page and an instruction.** The 2026-11-01 attempt returned "concrete event answers instead of an action containing a Prism program"; round 2's schema writer returned the articles 3 times. Answer-first asks for exactly that.

## Each step

**Text lines** (code):
- One line per element that has direct text of its own, in document order. A line's text excludes descendants that are lines themselves, so the same text never appears twice from nesting. Lines inside a link are marked `→`.
- A cited value is resolved by code to the deepest element within that line whose text equals the value, or contains it.
- Hidden-by-CSS content can't be told apart without a browser, so it stays in the view. Spiegel's mobile swiper slides appear as duplicate lines. The cited line number fixes which copy is meant.

| Step | Who | Sees | Returns | Checked by code (retry on failure, as a cortex `output.validate`) |
|---|---|---|---|---|
| Read | model, a cortex agent | instruction, field names (the caller's schema, or none), the text lines | `{ items: [ { <field>: { line, text } \| { line, link: true } \| { lines: [a, b, …] } } ] (3–5 items: the first, the last and some between, within the part of the page that answers), count: n \| null, limit: n \| null, follow: [line, …] }` | every `text` is on its line; `link: true` lines are links; `follow` lines are links |
| Candidates | code | HTML and the cited elements | candidate rules `{selector, fields}` that reproduce every example | each is run on the page |
| Item | model, a choice | the first example's text at each candidate level | one level | — |
| List | model, a choice; only when more than one list remains | each list's record count and its first `count` (or 5) records as text | one list, or none | none of them fits → findings, Read again once; "none" is not trusted as a signal on its own (Snowdrop: right 2 of 9 times) |
| Map | Prism's agent | record sample, target shape, notes | Prism program | valid against the schema |
| Check | code | result | — | each example is in one result item, field by field; `count` |

**Value kinds:**
- `{line, text}`: a text value.
- `{line, link: true}`: the URL of the link on that line, taken from its `href` by code. The model never copies a URL.
- `{lines: […]}`: a value that is a whole list (SQLite's change lists). Code finds the common element of those lines.

**Top N:** `limit` is stored in the stage (`stage.limit`, a new optional field) and `walk` applies it. "The three most recent" becomes a link rule plus `limit: 3`; "the top 10" a record rule plus `limit: 10`. It no longer depends on the page allowance.

**Links:**
- Read returns `follow` lines; code finds the link rule from those elements, as for records.
- At the next level, Read runs on the first fetched page.
- On every other page at that level, the rule must select at least one record, and every field must find at least one value.

**Schema:** inferred by code from the Read answer:
- field names as given;
- `string` for text and link values;
- an array of strings for `lines`;
- then made optional and nullable as today.

A caller schema is used as given. There is no schema-writing model.

**Large pages:** Read gets the whole text view while it fits in the request (Spiegel's is about 13–14k tokens with line numbers). Beyond that it gets line chunks in order, and the first chunk that holds answers is used. The `last` example and `count` then refer to that chunk, and this limit is stated.

## Offline evidence (no model; examples taken from the expected answers, matched by value)

Every row comes from one prototype, `data/pilot/induce2.mjs` (about 190 lines), measured by one script, `data/pilot/induce2-eval.mjs`. A case passes only when the **whole** rule works: records and every field.

| Case | Result |
|---|---|
| Django, 3 examples | **one** option, the right one: `ul.list-news > li`, fields `h2 a`, `p`. Its output equals `expected.json` exactly. No choice needed |
| SQLite chronology, 2 link examples | 7 options in 2 item levels. 3 of them give the right first three links (3.54.1, 3.54.0, 3.53.4), the stablest being `a[href^="releaselog/"]`. A List choice is needed |
| SQLite release page, 1 example (heading + one change line) | one option, `body`, which does **not** carry to the other two pages. From a single change line the change field became "the first nested entry" (`li[value] li:nth-child(1)`). One line cannot say "every entry"; that is what `{lines: […]}` is for, and it is not yet run |
| Spiegel, all 120 triples of the 10 reference teasers | the right **records** are among the options in 120 of 120 triples (earlier version, `article` etc.). A **complete** rule (records and every field right for ≥ 8 of 10 reference teasers) in only **13 of 120**. Big and small teasers put the headline and description in different elements, and finding one field rule across layouts mostly fails |

What this shows:
- **Records:** finding the repeated record from examples works on all four pages.
- **Fields across differing layouts:** this is the hard part, and plain code does not solve it yet. I stopped tuning against one page so as not to overfit.

The design consequence is the next section.

## Fields: code first, checked on the whole list, then one small model question

**Order:**
1. Item and List choose among **record** options.
2. Fields comes after the list is chosen.
3. The List options show each record's extracted field values where code found field rules, and the record's text where it did not.

The prototype still drops options without field rules before choosing. It has to change to this order.

**A field rule found by code is not trusted on the examples alone.** A field that has a value in every example must have a value in each of the first 10 records of the chosen list; otherwise the Fields step runs. Measured on Spiegel (`data/pilot/field-check-eval.mjs`, every option of all 120 triples):

| Code-found field rules | Count | With the check |
|---|---|---|
| Right (≥ 8 of 10 reference teasers with the right headline) | 43 | 29 kept, 14 sent to the Fields step (cost, not error) |
| Wrong on the other teasers | 1,871 | 1,837 caught (98%), **34 missed** |

The 34 it misses give non-empty but wrong values, for example a kicker in the headline field. That is why List shows extracted values, so the model choosing the list sees them. Whether that catches them is not proven.

When code finds no field rule, or its rule fails the check, the field rules become a third small model question instead of more heuristics:

| Step | Who | Sees | Returns | Checked by code |
|---|---|---|---|---|
| Fields | model, a cortex agent; only when code found none | the chosen record rule, and the HTML of **each example record** (a Spiegel teaser is 1–6 KB), with the example values to find in each | one CSS rule per field, read inside the record (a selector list is allowed) | each rule, run on each example record, returns that record's example value; retry with the mismatch |

This is the "write CSS" job again, but cut down to a few KB of HTML with the expected values given. That is a defined problem, unlike today's "find the records and fields on a 96 KB view of the page".

## What is not proven

- **Read on a real model:**
  - whether 120b or 20b cites the right lines;
  - whether it takes "first, last, some between" from the part of the page that answers. Its only real Spiegel answer so far, the round-2 schema writer, started with the news ticker.
- **Item and List as real choices:** Snowdrop's 69 of 71 was Jev choosing among 3 written items, not among lists of records.
- **Their size:**
  - Item options are merged by code when two levels show the same text, so the model never sees duplicates. Spiegel then has at most 2 item levels.
  - Lists per item level run to a median of 32 for Spiegel. Showing each by its first 10 records cut to a fixed length is about 5–6k tokens, and the List prompt must handle that many options.
- **Fields on a record snippet:** whether a small model writes working field rules for 1–6 KB of record HTML with the values given.
- **Rule-finding beyond these pages.** It must be run on every saved page Haptic has (`tests/fixtures/reuse/`, `procedures/`, `files.html`) and on the 17 benchmark cases' pages once captured.
- **XML and JSON:** the same idea with paths. Not prototyped.

## Pilot

Same frozen pages and pass bars as before.
- **Models:** 4 runs per case with 120b, and 4 with 20b for Read.
- **Ceilings from measured costs:**
  - Read ≈ the text view plus 1.5k (Django about 4k, SQLite about 3k, Spiegel about 15k);
  - Item about 1–2k; List up to about 6k;
  - Fields about 3–10k when needed;
  - Map 13–53k as measured.

  Ceilings per discovery: Django 30k, SQLite 70k, Spiegel 80k.
- **Prompts:** Read, Item and List come to you word for word first.
- **Cost:** at most about 24 × 80k ≈ 1.9M input tokens; expected about 0.8M.

Before the pilot, at no token cost: run rule-finding on all saved pages, with examples taken from their expected answers, and report how often a passing list is among the options.

## What changes in `typescript-rebuild.md`

| Section | Change |
|---|---|
| Discovery | replaced. No schema agent, no rules agent, no `inspect`. Probes become the Read examples |
| Artifact | stages gain an optional `limit` |
| `walk`, search, Strata, profile, Prism mapping | unchanged |

## Decision

**Replace the Discovery design with this, and pilot it.** The alternative is the smaller fix above: keep the rules agent and drop only the schema writer.
