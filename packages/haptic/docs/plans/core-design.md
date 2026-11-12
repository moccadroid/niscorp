# Haptic core: the pilot's discovery, built into the package

Status: design, not built; reviewed once (2026-11-08) and corrected. It replaces the **Discovery**, **Hand traces**, **Budget** and **Build order** sections of `typescript-rebuild.md`, and the positions there about probes, the schema author, the one repair run and "each level is final" (marked there). That document's purpose and principles, the artifact runtime `walk`, Search, Breaking changes and Decision 1 (signal `decide` carries images, landed) still stand, with the changes noted below. Evidence for every choice is in `docs/plans/answer-first-discovery.md`, `read-mistakes.md`, `code-filter.md`, `linked-items.md`, `escalation.md`, `big-pages.md`, `heldout-1.md` and the rounds under `data/pilot/`.

## What the pilot proved

- 17 tuned pages × 3 (round L): **49 of 51 complete (96%)**, about 18k input tokens per discovery, median 2.4 s (22 s when escalated).
- 12 unseen sites, blind cases and references (11 scored × 3): **19–20 of 33 (about 60%)**, about 98k input tokens per discovery, most of it Jev on long lists.
- For orientation only: the old pipeline scored about 24 of 34 on the tuned pages on 2026-11-03 with its own grader, at about 100k tokens and 48–85 s.

The design: **models answer small checkable questions; code does the rest.**

| Step | Who | What |
|---|---|---|
| Section (big pages) | Jev, choice | when a page's text view is over 64 KB: which section holds the items; Read sees only it (without a TypeSafe key: the first 64 KB) |
| Read | 120b, low (high when escalated) | cites up to 5 example items by line, plus count, limit, links to follow and the next level's task; 3 tries, an empty provider reply does not use one up |
| Citation check | code | text on its line (compared folded: case, whitespace, dashes, quotes), link lines are links, a line belongs to one item; retries name nearby lines |
| Link rule (link levels) | code | the rule whose first links are the cited ones; rules giving the same addresses are one option; visited links and fragments dropped; how many: Read's limit, else the number of cited links, within the caller's `maxPages`; the next level's task with the first page's line numbers removed |
| Record and field rules | code | from the cited elements; the record rule must match on every page of the level; innermost rows; one rule per kind for mixed fields; stablest, then fewest matches |
| Which list | code | the list nearest Read's count, ties to the fewest records |
| Field rules when code finds none | 120b | checked against the cited values |
| Which records belong | code + Jev | cited records and equal ones are kept; on a one-page level where Read's count is no more than it cited, the rest are dropped; otherwise Jev answers yes/no per remaining record (6 at a time); a record Jev fails on is left unlabelled |
| Filter | code | one phrase all kept records share and no dropped one has → the stage's `where` |
| Result program | code or `prism.mapping` | code writes a copy program when nothing is left to filter (no drops, or a `where` was found), every result field is a stage field, and the copied values fit the schema; otherwise the published agent (below) |
| Rendering | code (jsdom) | when a level shows the decoy signal |
| Escalation | code | a stop, or a finding other than the count, runs the whole discovery once more at high; the first attempt stands unless the second is strictly better (ready before stopped, then fewer missing cited examples, then fewer other findings) |

**The mapping agent**, when used: Prism's published prompt and notes, a 16 KB sample of the records, `stepCount(4)`. Its check: Prism runs the program on all records, the result matches the schema, every cited example is in it (always retried), and — only when labels exist and no `where` was found — the label comparison, asked once; a second mismatch is a finding. If no program passes everything, the last one that kept every cited example is used.

## The artifact (data, `nisc.haptic` grammar, version 0)

The shape of `typescript-rebuild.md` with what the pilot added. A real one, Perl's "read the entire book free online" links (round L):

```json
{
  "stamp": { "nisc.haptic": 0, "nisc.prism": 2 },
  "policy": { "linkDepth": 0, "maxPages": 1, "maxRedirects": 3, "stripFragments": true, "accept": { "statuses": [200] } },
  "stages": [
    { "format": "html", "render": false,
      "selector": "div.col-12",
      "fields": { "title": { "selector": "h3", "attribute": null },
                  "link":  { "selector": "p.description a", "attribute": "href" } },
      "required": ["title", "link"],
      "where": { "in": "text", "contains": "the entire book free online" },
      "limit": null,
      "links": null }
  ],
  "mapping": { "$map": { "over": { "$ref": "$.records" }, "as": "r",
               "body": { "title": { "$get": { "from": { "$var": "r" }, "path": ["fields", "title"] } },
                         "link":  { "$get": { "from": { "$var": "r" }, "path": ["fields", "link"] } } } } },
  "outputSchema": { "type": "array", "items": { "type": "object", "properties": { "title": { "type": ["string", "null"] }, "link": { "type": ["string", "null"] } } } }
}
```

New against `typescript-rebuild.md`:
- **Field `list: true`** for a field that collects several values; otherwise one value, the first match. A field selector may be a selector list (`p, li, h2`).
- **`required`**: a record without a non-empty value for one of these fields is not an item. Search's results stage uses the same meaning (it said "exactly one value"; now "a non-empty first value").
- **`where`**: `{ in: <field> | "text", contains: <phrase> }`, compared folded.
- **`limit`**: the first N records.
- **Order, per page:** `required` → `where` → `limit`. Link stages have only a link rule and `limit`.
- **`render: true`**: the level's pages run their own inline scripts before selection.
- **Record values** handed to the program: text with whitespace collapsed, addresses resolved; `{ sourceUrl, text, attributes, fields }`. Only the last stage's records reach the program.
- The next level's task (`next`) is discovery's, not run-time data: it stays in the discovery result, not the artifact.

**Broken runs:** a run whose last stage yields no records, at any page, is reported `broken` in the run result — the hook for re-discovery later. Nothing more in this build.

## Rendering

- **Signal:** one link address shared by at least 3 links with 3 different texts (SQLite's `hp1.html` decoys). If any page of a level shows it, every page of the level is rendered, at discovery and on every run of the artifact.
- **How:** jsdom runs the page's inline scripts, no network, no external files, 600 ms for timers (0.6–0.7 s per page). If rendering fails, the page is read as fetched.
- **Isolation:** jsdom's script context is not a security boundary, and a `worker_threads` worker shares the process. Rendering runs in a **child process under Node's permission model** (no file-system write, no child processes), terminated after each page, with a time cap. Whether that is enough for live pages is decision 2.

## Discovery: modules

One entry point, `discover(request, options)`; one module per step.

| Module | From the pilot | Lines (pilot) |
|---|---|---|
| `discovery/discover.ts` — the ladder and the pick rule | `escalate.mjs` | 46 |
| `discovery/attempt.ts` — one attempt: walks the levels, calls the steps below | `pilot2.mjs` `runCase` | ~120 |
| `discovery/view.ts` — text view, folding, line resolution | `lines.mjs` | 93 |
| `discovery/sections.ts` — budget and the section question | `sections.mjs` | 39 |
| `discovery/read.ts` — the Read agent, its answer, citation check and retries, empty replies | `resolve.mjs`, `pilot2.mjs` | ~120 |
| `discovery/links.ts` — the link rule, addresses, next task | `pilot2.mjs`, `next-task.mjs` | ~50 |
| `discovery/rules.ts`, `discovery/lists.ts` — record and field rules, list choice | `rules.mjs`, `choose.mjs` | 189 |
| `discovery/members.ts`, `discovery/phrase.ts` — Jev labels, the `where` phrase | `membership.mjs`, `phrase.mjs` | 124 |
| `discovery/findings.ts` — example and label comparisons, shared by the program check and the result | `pilot2.mjs`, `membership.mjs` | ~70 |
| `discovery/program.ts` — copy program or the mapping agent | `pilot2.mjs` | ~90 |
| `artifact/stage.ts` — the stage reader (select, clean values, `required` → `where` → `limit`), used by `walk` **and** by discovery, so both select the same records | `pilot2.mjs` `extractStage` | ~45 |
| `render/` — decoy signal, child process | `render.mjs` | 46 + process |
| `profile` — prompts (word for word from `PROMPTS.md`), model settings, budgets, timers | `prompts.mjs` | 61 |

Model calls as today (`createModelClient`, `observeAuthorOutput`, Retry-After, `blocked`); Jev is `createSignal('typesafe')`. Prism and cortex from published releases with the error-message fixes (Prism 0.3.2; cortex after its pending release).

**Empty provider replies:** the pilot recognises them by cortex's retry text ("produced no output"). The package needs cortex to tell it (a field on the retry event); that is a cortex case to bring, not a change made here.

Removed from `typescript-rebuild.md`'s discovery: `haptic.schema` (the schema comes from the examples or the caller), `haptic.rules` with `inspect`, probes, the 300k budget counter. Search used none of them except the per-discovery budget (decision 1). The fresh live trial before `ready` stays. `asOf` is not used by discovery's questions; it stays on the request for search.

## Result

`{ status: 'ready' | 'unresolved' | 'blocked', artifact, outputSchema, trial, findings, attempts, next, usage, blocked, reason }`. `attempts` carries each attempt's effort, status, findings, tokens and time. Findings: missing or lost cited examples, label mismatches, and "N items, the reader counted M" (one-page levels only).

## Limits this design accepts (known, measured)

- **One group among many alike** (DigitalOcean's 17 identical groups, 7-Zip's release tables): the records come from all groups.
- **Merged table cells** (Wikipedia's rank tie, 7-Zip's shared description): a position-based field rule picks the wrong cell after a merged cell.
- **Valid but wrong answers** pass every check (a "?" icon cited as a status; Node.js "modules" read literally).
- **Bot checks** (PyPI's "Client Challenge"): not detected.
- **Jev cost on long lists**: one call per uncited record (Node.js 197–394 per discovery).
- **Fields across levels** cannot be combined: the program sees only the last level's records.
- **HTML only:** the pilot covered HTML pages. XML and JSON stages, `resources` and `references` (`typescript-rebuild.md`) have no discovery in this design (decision 3).

## Bench and targets

The pilot's two sets become `benchmarks/`: the 17 tuned pages and the 12 held-out sites, frozen captures, blind references, the pilot grader's rules. The package must reach, on the same captures:

| Set | Complete | Input tokens per discovery | Time |
|---|---|---|---|
| Tuned, 17 × 3 | ≥ 90% (pilot 96%) | ≤ 25k average (pilot 18k) | median ≤ 5 s (pilot 2.4 s) |
| Held-out, 11 × 3 (PyPI excluded) | ≥ 55% (pilot 58–61%) | ≤ 110k average (pilot 98k) | — |

A new set of unseen sites (development and test, never tuned on) follows the build; it is not a gate for it.

## Build order

1. `render/`: signal and the child process, tested on the SQLite capture (real links) and the 16 others (text view unchanged).
2. `artifact/`: grammar version 0 with the new fields, `prepareArtifact`, `stage.ts`, `walk` (render, stage reader, links, program, `broken`). Tests on the round-L artifacts and captures.
3. `discovery/`: view → read → links → rules/lists → members/phrase → findings → program → attempt → discover, each tested on saved pilot answers with no model (the replay scripts become tests).
4. Bench gate: both sets live once. Miss → stop and report.
5. Search (`typescript-rebuild.md`) on the new `discover`, with the `required` meaning above and decision 1's cap.
6. Strata grammar, `check:package`, changeset; delete the old pipeline (`typescript-rebuild.md` step 7).

## Formats: HTML first, XML and JSON as adapters

Only two steps know the page format: the **view** (page → numbered lines, a line → its element) and the **rules** (cited elements → record and field rules, and the stage reader that applies them). Read, the citation check, links, lists, labels, the phrase filter, findings, the program and escalation work on lines, records and values only. So the build defines one interface, a format adapter (`view`, `rules`, `stage`), and HTML is its first implementation:
- **XML** slots in with little code: the same view over an XML DOM, CSS rules over it (css-select works on XML; today's XPath reader stays for artifacts that use it).
- **JSON**: the view is one line per value with its path (`items[3].title: "…"`), the record rule an array path, fields relative paths; the stage reader is a Prism `$map` over that path. More new code than XML, no change elsewhere.
Each new adapter needs its own small bench before it counts as done. In this build, artifacts keep `typescript-rebuild.md`'s XML/JSON stage shapes and `resources`, run by `walk`, but discovery writes HTML stages only.

## Removing the old code

The build ends with nothing of the old pipeline left (step 6):
- **Deleted:** all workflow JSON (`src/discovery/*.json` except the output-rejection rules and the new profile, `src/search/search.json`); the interpreter (`src/engine/operation.ts`, `prepare.ts`, `schema.ts`, `versioning.ts`, `index.ts`); the old discovery TypeScript (`model.ts`, `review*.ts`, `result-contract*.ts`, `source-author.ts`, `task-declaration.ts`, `trial.ts`, `blueprint.ts`, the phase and rules schemas, `html-*.ts` replaced by `view.ts`); `src/operations/` (replaced by `artifact/` and the connector); search wiring (`src/search/index.ts`, ranking, image-choice `index.ts`); `src/migrations` `ENGINE_*`; the tests that drive the JSON pipeline; `docs/development/` and `docs/measurements/` (they describe the old internals) replaced by README, DESIGN and STATUS; `scripts/pilot/`, `scripts/pilot2/` (once ported: the replay scripts become tests), `scripts/replay-discovery-artifacts.mjs`, `scripts/search-image-adapters.mjs`.
- **Kept:** `src/connector`, `src/readers`, `model-transport.ts`, `author-output.ts`, `output-rejection.*`, `engine/json.ts`, `errors.ts`, `schema-admission.ts`, `contracts.ts`, image-choice `reader.ts`, `imagescript.ts` and `buildFormSubmission`; reader, transport and image-choice tests.
- `check:package`, CI and the changeset change with it. A grep for every deleted export across the monorepo runs before the deletion lands.

## Decisions (settled 2026-11-08)

1. **Caps, configurable in the profile.** Defaults from the runs: **400k input tokens per discovery** (no run exceeded 380k; the tuned pages never exceeded 73k) — when reached, no new model call starts and the best attempt so far is returned; **250 Jev calls per attempt** (the most seen was 197) — past it, the remaining records stay unlabelled and get no `where` filter. Search's cap is the sum of its discoveries' caps.
2. **Rendering is safe and good at once.** The cost of safety is start-up time, not quality: the same jsdom, in a separate child process under Node's permission model (no file-system write, no child processes), with an empty environment (no keys or secrets in it), loading no resources, killed after each page or at its time cap. That adds about 50–100 ms per rendered page. Node's permission model does not close the network; a host that needs that adds an OS-level sandbox (a container) around the same process. The SQLite result is the same either way.
3. **XML and JSON** come as format adapters after this build (above); artifacts already hold their stage shapes.
4. **Keys:** Haptic's callers pass a Groq key and a TypeSafe key. Without TypeSafe, labels and sections are skipped (no filter phrase; Read sees the first 64 KB of a big page).
