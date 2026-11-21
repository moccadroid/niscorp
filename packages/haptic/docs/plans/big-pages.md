# Big pages: Read sees the section that holds the items

Status: **built 2026-11-07 (Jev question approved as written), `scripts/pilot2/sections.mjs`.**

Result: Jev picked "Tallest buildings in the world" in all 6 Wikipedia runs (`heldout-wiki`, `heldout-runs2`); input tokens per run fell from 234–380k to 75–107k. Wikipedia is still 0 of 3 complete, for two other reasons: (1) the tie at rank 8 spans one rank cell over two rows (134 merged-row cells on the page), so "2nd cell" picks the wrong cell on the second tied row and Tianjin CTF Finance Centre is missed every time; (2) in some runs Read cited each building's link, so names came back as article titles ("The Clock Towers" for "Mecca Royal Clock Tower"). Held-out set with it (`heldout-runs2`): 19 of 33 complete (before: 20), about 98k input tokens per run, most of it Jev on DigitalOcean's and Node.js's long lists. Evidence: `data/pilot/heldout/size-check.mjs`, `outline-check.mjs` (no model).

## Why

Read gets the whole page's text view. On Wikipedia's tallest buildings (1.3 MB of HTML) that is 188 KB, 4,437 lines: about 274k input tokens per run, and Read failed or cited the wrong kind of value in all three runs. The wanted table is one section of 24 KB; "References" and "External links" alone are 107 KB.

Other pages are far smaller: the next largest text views are HAProxy 57 KB, curl 45 KB, GitHub 41 KB (all complete today).

## The change

1. **Budget.** When the text view of a page is over 64 KB (about 16k tokens: a cost limit, not fitted to a page; only Wikipedia is over it today), code splits it at its headings (h1–h6 lines) into sections, each with its heading, line range and size.
2. **One Jev choice question** picks the section holding the items, with the real headings as options:
   ```json
   {
     "type": "choice",
     "instructions": "A long web page is split into sections by its headings. Which section holds the items the instruction asks for?",
     "criteria": { "s1": "<heading 1> (lines a–b)", "s2": "<heading 2> (lines c–d)", "…": "…" }
   }
   ```
   State: `{ instruction, sections: { s1: "<heading>\n<its first 3 lines>", … } }`.
3. **Read sees only that section's lines**, numbered as on the whole page, so every citation and rule works unchanged. If the chosen section is still over the budget, Read sees its first 64 KB.
4. If the run stops or ends with findings, escalation runs as today; the high attempt asks the same question again.

## What it should change

- Wikipedia: Read sees 24 KB instead of 188 KB (about 7k tokens instead of 50k per call). Whether it then cites names as text and finds the 10 rows is for the run to show.
- No other page in either set is over the budget, so nothing else changes.

## Costs and risks

- A new Jev question, asked only on pages over the budget.
- Items spread over several sections (a list continued under a second heading) would be cut to one section. The choice could later allow several sections; not now.
- Pages whose headings are not h1–h6 elements get one section — the whole page, cut at the budget.
