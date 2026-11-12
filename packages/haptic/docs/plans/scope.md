# Records live where the examples live

Status: **review said NO (2026-11-07); not built.** The naming step was broken: phrases were built from split words but tested against raw text, so "buffer c addons" (Node.js) and "description download exe" (7-Zip) appear nowhere, not even in their own scope, and "the first element containing the phrase" can silently pick another group. With structure only (the nearest ancestor a selector names uniquely, prefixed to the record rule, guarded by Read's count; `scope-structural-check.mjs`), Node.js goes 212 → 69 records (66/66 +3 instead of +14) and Ruby 8 → 6; DigitalOcean and 7-Zip have no unique ancestor and are unchanged. Telling DigitalOcean's 17 identical groups or 7-Zip's 9 identical tables apart needs text ("Managed Databases"), which is a design decision for the owner. The evidence table below is from the broken check and is kept only as the record of what was proposed.

Original status: proposal, nothing built. Evidence: held-out round `data/pilot/heldout-runs1` and tuned round `bench17-runsL` (saved first-attempt Read answers), offline checks `data/pilot/heldout/size-check.mjs`, `scope-check.mjs`, `scope-phrase-check.mjs` (no model).

## Why

On new sites the record list is often the whole page's worth of alike elements, not the list the instruction means:
- DigitalOcean: 228 region rows from ~20 groups; the instruction wants the 14 of "Managed Databases". Jev cannot tell them apart (same names) and is asked ~165 times per attempt.
- Node.js: 212 entries — the module index plus its sidebar copies. Jev rightly says yes to the copies, ~197 calls per attempt (219k input tokens per run).
- 7-Zip (51 rows from every release table) and Ruby (8 paragraphs) on the tuned set are the same thing.

Read cites "the first, the last, and some between" of the items. So the smallest element holding every cited example's record should hold the whole wanted list.

## The change

1. **Scope.** After the list is chosen, its scope is the smallest element holding every cited example's record. Records outside it are dropped before labelling — they are not items and are not asked about.
2. **Guard.** Only when Read gave a count and the scope still holds at least that many records (and fewer than the whole list). Otherwise nothing changes. Debian round L run 3 is the case: Read's examples did not span the table, and the scope would keep 9 of the 16.
3. **Named in the artifact as data:** `within: { selector, contains }` on the stage. Code tries the scope and then up to 3 parents, and takes the first that either
   - has a selector matching only it on the page (an id, a unique class) → `{ selector }`, or
   - with its tag-and-class selector, holds a phrase of 1–3 words that no alike element holds, the earliest such phrase in its text → `{ selector, contains }`,
   and holds the same records as the scope. If none within 3 levels, there is no scope (today's behaviour).
   At run time the stage finds the elements matching `selector`, keeps the first whose folded text contains the phrase, and selects records only inside it. Order: `within`, then `required`, then `where`, then `limit`.

## Evidence (offline, saved answers, graded against the references)

| Case | Records before → after | Graded after | Named by |
|---|---|---|---|
| DigitalOcean ×3 | 228 → 15 | 14/14 +1 | group container, "managed" (from "Managed Databases") |
| Node.js ×3 | 212 → 68 | 66/66 +2 | the main list, "buffer c addons" (its first entries) |
| 7-Zip ×3 | 51 → 15 | 3/3 +12 (current table; the phrase filter or mapping drops .msi etc.) | the table, "description download exe" |
| Ruby ×3 | 8 → 6 | 3/3 +3 | `#content` |
| Debian run 3 | 19 → 9 | would lose 10 | not scoped: the guard |
| 13 other pages | unchanged | unchanged | — |

Jev's calls on DigitalOcean and Node.js fall from ~165–197 per attempt to ~10–60.

## Costs and risks

- A new stage field and one more rule-finding step (scope naming).
- A phrase can be today's content ("buffer c addons" are module names; 7-Zip's "description download exe" includes header words that older tables lack). If the page changes, the scope may vanish — the run then finds no records, which the empty-run check catches; it does not silently pick another group.
- The guard rests on Read's count, a guess; it only ever prevents scoping, never causes it.
