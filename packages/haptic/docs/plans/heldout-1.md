# Held-out set, first run (2026-11-07)

12 cases on 12 sites the pilot never saw, picked and worded by an agent that did not see the pilot (`data/pilot/heldout/suite.json`); pages captured the same day (`data/pilot/heldout/capture.mjs`; link-following cases capture every same-site link of the start page); references written blind from the captures by three fresh agents (`data/pilot/heldout/reference/`). Run once with the round-L pilot (escalation ladder and rendering), no tuning: 12 cases × 3, `data/pilot/heldout-runs1`.

## Result

**20 complete of 33 (61%)**; with partials that hold all or most items, 28 of 33. The tuned set scored 96%. PyPI is not scored: Haptic's plain fetch got a "Client Challenge" bot-check page, not the package page.

| Case | Complete | What happened |
|---|---|---|
| PostgreSQL final release dates | 3/3 | |
| Fly.io smallest machine price | 3/3 | rendered (decoy signal) |
| Go blog recent posts (links) | 3/3 | |
| HAProxy LTS versions | 3/3 | all three rescued at high |
| TypeScript blog headings (links) | 3/3 | weak reference key |
| jQuery UI final releases | 2/3 | run 3: the high mapping failed, the low result with extra rows stood |
| Node.js API modules | 2/3 | run 3: Read took "modules" literally (5 "Modules:" entries) |
| USENIX upcoming events | 1/3 | 9 of 15 once; field rules failed at both levels once |
| nginx legacy archives | 0/3 | 15–16 of 19: one field rule (`td:nth-child(2) a:nth-child(1)`) misses rows laid out differently |
| DigitalOcean database regions | 0/3 | all 14 plus 27–44 extra: the region rows of all ~20 groups look the same; only the group heading tells "Managed Databases" apart |
| Wikipedia tallest buildings | 0/3 | huge page (1.3 MB); Read cited the name as the link, so names came back as addresses and the text keys do not match; run 3 is otherwise 9 of 10 (+ Taipei 101); one Read failure |

## Cost

3.64M input tokens for 36 runs, about 100k per run (tuned set: 18k). Big pages (Wikipedia 1.3 MB, Fly.io 355 KB, DigitalOcean 234 KB, Node.js) cost 150–380k each, and escalation doubles them. Time: most runs 2–60 s, the worst 188 s.

## Failure classes

1. **One section among many alike** (DigitalOcean; seen before on 7-Zip and Ruby): what separates wanted from unwanted rows is the heading above them, which no record holds.
2. **Rows laid out differently** (nginx): a position-based field rule fits some rows, not all.
3. **Very large pages** (Wikipedia, and the cost on Fly.io, DigitalOcean, Node.js): Read sees the whole page.
4. **Reading the instruction** (Node.js "modules", USENIX field choice).
5. **Bot checks** (PyPI): detected by nothing yet.
