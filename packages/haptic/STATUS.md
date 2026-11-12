# Haptic status

Measured 2026-11-08 to 2026-11-12, gpt-oss-120b through Groq, Jev through TypeSafe.

## Results

| Set                                                                                                                       | Complete    | Input tokens per discovery | Time per discovery |
| ------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------- | ------------------ |
| Tuned: 17 pages × 3 runs (`benchmarks/tuned`)                                                                             | 48/51 (94%) | 16.4k average              | median 4 s         |
| Held-out: 11 sites × 3 runs, written blind, never tuned on (`benchmarks/heldout`, PyPI left out: its page is a bot check) | 22/33 (67%) | 96k average                | median 23 s        |

"Complete" means every item of an independently written reference list is in the result, with at most one extra item (or 10%). One live search ("Show me a list of ai meetups in Vienna!", 2026-11-12) ranked 5 sources; 4 gave usable artifacts that ran again with no model in 1.5–2.7 s.

## Known limits

- **One group among many alike** (DigitalOcean's 17 identical tables, 7-Zip's release tables): the records come from all groups.
- **Merged table cells** (Wikipedia's rank ties): a position-based field rule reads the wrong cell after a merged cell.
- **Valid but wrong answers** pass every check: a reader that cites a link address where a title was asked for, or reads "modules" literally.
- **Bot checks** other than DuckDuckGo's image challenge are not detected (PyPI's "Client Challenge").
- **Jev cost on long lists**: one call per uncited record; Node.js's API list takes about 200.
- **Fields across levels** cannot be combined: the program sees only the last level's records.
- **Rendering costs about 1.4 s per rendered page** (0.85 s of it starting the process and loading jsdom), twice per discovery: once in the attempt, once in the trial.
- **Rule search on very long tables is slow**: curl's release table takes about 40 s of code, no model involved.

## Not built yet

- **XML and JSON discovery.** Artifacts already have XML and JSON stages, reference programs and resources, and `walk` runs them; discovery writes HTML stages only. The cases for that work are in `benchmarks/xml-discovery-suite.json`, `json-discovery-suite.json`, `reference-discovery-suite.json`, `html-records-suite.json` and `realistic-discovery-suite.json` (no harness yet).
- **Empty provider replies** are recognised by signal's wording ("the turn produced no output"); cortex should mark them on its retry event. That is a case for cortex, not changed here.
- **The image-challenge solver ran only offline**: DuckDuckGo did not challenge the live search of 2026-11-12.
- **Field rules from the model** (when code finds none) ran live once and failed (a second Meetup group page).

## Checking a change

- `pnpm check`: build and the offline tests (no model, no network): the runtime, the four saved discovery runs replayed through `discover` with their recorded model answers, search rounds, the image challenge, readers and transport.
- `pnpm check:package`: the packed package in a fresh consumer runs generated artifacts with every model import refused, and its entry points typecheck with and without the optional peers.
- `pnpm check:grammars` (repository root): the `nisc.haptic` grammar against its snapshot, and the captured artifacts upgraded and parsed.
- `pnpm bench --set=tuned --round=<name>` then `pnpm grade --set=tuned --round=<name>`: the tuned set live (needs `GROQ_API_KEY` and `TYPESAFE_API_KEY` in `.env`; about 0.8M input tokens for 51 runs). The held-out captures are 59 MB and stay out of the repository, in `data/pilot/heldout/captures`.
