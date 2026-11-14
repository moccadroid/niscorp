# Content fields: why TypeScript, Go and SQLite release notes fail

Status: built, measured and reverted (2026-11-15). Three strict rounds of each set (`heads1–3`): TypeScript 0 → 6 of 9 and Go blog 5 → 8, but other sites lost runs where Read answered differently on pages with headings (Wikipedia 6 → 3, Node.js 9 → 7, Debian 9 → 6, Perl 9 → 7, zlib 6 → 4). Held-out 22, 23, 22 → 25, 22, 24; tuned 46, 48, 47 → 45, 44, 45; both sets together 208 → 205. The owner chose to revert. The proposal below was reviewed once (NO) and corrected before building. Traced on the strict rounds `fstrict1–3` of both sets with `data/compare/harness/cited-lines.mts` and `why-content.mjs`. The three cases lose 20 of the 44 incomplete strict runs (held-out 11 + 10 + 11, tuned 5 + 3 + 4).

## What Read is told and what it sees

For a field with several values, Read is told: `{ "lines": [n, m, ...] }: a field with several values, one per line. Give up to 5 of those lines: the first, the last, and some between.` Code turns the cited lines into a rule: when the cited lines are of several kinds, every text block of their family inside the smallest element holding them all; when they are of one kind, one rule for that kind.

Read sees each line as its number and its text; a link line carries `→`. Nothing marks a heading.

## The three causes

- **TypeScript (0 of 9).** The instruction asks for "the section headings inside the article". In 8 of 9 runs Read cites body paragraphs among the `<h2>` lines ("Stabilizations in --lib es2026 include:", "Source phase imports are a proposed new feature…"): it cannot see which lines are headings, so the rule takes every paragraph. The one run that cited only headings cited only `<h2>` lines and got `article h2`, which misses the two `<h3>` headings.
- **Go blog (5 of 9).** Read cites a line outside the article body as part of it: the author line, the footer link "Terms of Service", or the cookie banner's "Okay" button. The passage then holds the author line, or code falls back to one rule per kind and loses the `<h3>` "Type-specified customization".
- **SQLite release notes (2 of 9).** In all 7 failing runs Read cites the paragraph that captions each change list ("Prior changes from version 3.54.0 …:") with the list items. Lists and footer are siblings in `<body>`, so the rule for `p` takes every top-level paragraph, footer included. The 2 passing runs cited only list items.

## Proposal: Read sees which lines are headings

Two changes, for TypeScript:

1. **The text view marks heading lines** with their level: `77 [h2] Support for Import Attributes in Ambient Modules`, `332 [h3] lib.d.ts`. A heading whose text is a link (TypeScript's index, `<h3><a>…</a></h3>`) is a link line, and is marked from the heading around the link: `73 → [h3] Announcing TypeScript 7.1 Beta`. A bracketed tag, not Markdown's `#`, because page text such as `#ifdef Windows` would read as a heading. Read's instructions gain, word for word, after "Lines marked → are links.":

   > Lines marked [h1] to [h6] are headings; the number is the level, [h1] the highest.

   If Read copies the mark into a text citation, code removes it before matching the line.

2. **Cited lines that are all headings take every heading in their passage**, of every level, even when Read cited only one level. Today one level gives one rule for that level, which is why `article h2` misses the `<h3>`s. Simulated on the TypeScript 7.1 Beta page: citing only `<h2>` lines then gives the 14 headings of the reference instead of 8.

- **Does not fix:** Go's lines outside the article and SQLite's caption paragraphs. Each needs its own change; neither is proposed here.
- **Risk:** every page's text view changes where it has headings, so Read's answers can change on every set. Only live rounds measure it: first one targeted pass (TypeScript, Go blog, SQLite release notes × 3 runs, about 0.3M tokens), then three strict rounds of each set against today's 22, 23, 22 of 33 and 46, 48, 47 of 51.
- **Change 2 on its own** touches pages where Read cites only headings for a many-line field; any such page would gain the other heading levels in that passage.

## Decision

The heading marks as shown and the instruction sentence above, word for word.
