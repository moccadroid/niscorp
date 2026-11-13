# Haptic status

Measured 2026-11-13 on the code of `docs/plans/speed.md`: three rounds of each set, one at a time on a quiet machine, gpt-oss-120b through Groq, Jev through TypeSafe.

## Results

| Set                                                                       | Complete, 3 rounds                 | Input tokens per discovery | Time per discovery |
| ------------------------------------------------------------------------- | ---------------------------------- | -------------------------- | ------------------ |
| Tuned: 17 pages × 3 runs (`benchmarks/tuned`)                             | 42, 43, 42 of 51 (83%)             | 14–15k average             | median 4 s         |
| Held-out: 11 sites × 3 runs, written blind, never tuned on (`benchmarks/heldout`) | 18, 16, 19 of 33 (54%) | 36–39k average             | median 5–6 s       |

On the same held-out set: Crawl4AI 9/33 (median 5 s), ScrapeGraphAI 6/33 (3 s), AutoScraper given two answers 3/33.

**Complete** means every item of an independently written reference list is in the result, each as its own item, with at most one other item (or 10%); a duplicate of an answer counts as another item. Where a reference lists them, the item must also contain the texts the instruction asks for and none of those it excludes: this is how the linked-page cases check each post's content, not only its title.

**Reuse.** Every held-out page was captured twice, 2026-11-07 and 2026-11-13; eight of the eleven changed in between, and the Go blog's answer changed (a new post). Each artifact a round saved was run again with no model on the later copy and graded against references written for it: in all three rounds, every artifact complete on the first copy was complete on the later copy (18, 16 and 19).

**Per held-out site**, complete runs of 9: DigitalOcean, Fly, HAProxy and PostgreSQL 9; Node.js and USENIX 6; jQuery UI 5; Go blog, TypeScript blog, nginx and Wikipedia 0.

## Known limits

- **Linked pages: the content is not what was asked.** TypeScript's "section headings" carry the article's paragraphs; Go's article bodies carry the author line and next/previous links, or miss subheadings; SQLite's change lists carry navigation text.
- **One group among many alike** with nothing unique around it (7-Zip's release tables, nginx's three version tables): the records come from all groups. A group whose container, or the element just before it, carries a unique `id` or `data-*` value (DigitalOcean) is found through that value.
- **Programs that name today's values**: a filter can leave out records by their current text (Wikipedia: "not Shanghai World Financial Center"), which breaks when the list changes. Nothing rejects it yet.
- **Duplicates**: Lua's one download link comes back several times.
- **Rules anchored on a generated value** (an `id` the site renumbers) can return the wrong records without reporting `broken` when the value moves to another element.
- **Merged table cells** (Wikipedia's rank ties): a position-based field rule reads the wrong cell after a merged cell.
- **Valid but wrong answers** pass every check: a reader that cites a link address where a title was asked for, or reads "modules" literally.
- **Bot checks** other than DuckDuckGo's image challenge are not detected; PyPI's "Client Challenge" page is why that case left the held-out set.
- **Fields across levels** cannot be combined: the program sees only the last level's records.
- **Rendering costs about 1.4 s per rendered page** (0.85 s of it starting the process and loading jsdom), twice per discovery: once in the attempt, once in the trial.

## Not built yet

- **XML and JSON discovery.** Artifacts already have XML and JSON stages, reference programs and resources, and `walk` runs them; discovery writes HTML stages only. The cases for that work are in `benchmarks/xml-discovery-suite.json`, `json-discovery-suite.json`, `reference-discovery-suite.json`, `html-records-suite.json` and `realistic-discovery-suite.json` (no harness yet).
- **Empty provider replies** are recognised by signal's wording ("the turn produced no output"); cortex should mark them on its retry event. That is a case for cortex, not changed here.
- **The image-challenge solver ran only offline**: DuckDuckGo did not challenge the live search of 2026-11-12.
- **Field rules from the model** (when code finds none) ran live once and failed (a second Meetup group page).

## Checking a change

- `pnpm check`: build and the offline tests (no model, no network): the runtime, the four saved discovery runs replayed through `discover` with their recorded model answers, search rounds, the image challenge, readers and transport.
- `pnpm check:package`: the packed package in a fresh consumer runs generated artifacts with every model import refused, and its entry points typecheck with and without the optional peers.
- `pnpm check:grammars` (repository root): the `nisc.haptic` grammar against its snapshot, and the captured artifacts upgraded and parsed.
- `pnpm bench --set=<set> --round=<name>`, three rounds, then `pnpm grade --set=<set> --round=<a>,<b>,<c>`: each set live (needs `GROQ_API_KEY` and `TYPESAFE_API_KEY` in `.env`; about 0.8M input tokens per tuned round, 1.2M per held-out round), graded with the spread across rounds. A second bench refuses to start while one runs. A change counts when it moves the result beyond that spread.
- Reuse: `tsx benchmarks/rerun.ts --set=heldout --round=<name> --captures=pilot/heldout/captures-2026-11-13 --out=<name>-later`, then `pnpm grade --set=heldout --round=<name>-later --references=benchmarks/heldout/references-2026-11-13`. `benchmarks/capture.ts` takes a new copy of a set's pages. The held-out captures are 59 MB each and stay out of the repository, in `data/pilot/heldout/`.
