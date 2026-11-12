# Haptic: discovery and search as code, artifacts as data

Status: proposal, not built. Nothing here is committed.

**Partly replaced by `core-design.md` (2026-11-08):** its Discovery, Hand traces, Budget and Build order sections, and these positions — "the model reviewer is replaced by probes", "the schema author runs first", "one repair run", "each level is final" — are replaced there (no probes, no schema author, no inspect tool; escalation reruns a whole discovery at high effort). The rest still stands, with `core-design.md`'s changes to `required` and the artifact fields.

## Purpose and principles

**Purpose** (my reading of `README.md` and `docs/development/current-status.md`):
- A request for internet information becomes a reusable artifact that later reads current data with no AI.
- The request is either a URL plus an instruction (discovery), or an instruction alone (search finds the sources, then discovery runs on each).
- Scheduling, storage and what happens with the data belong to the caller.

**Principles** (nisc `AGENTS.md`, "The thesis" and the toolbox):
- Everything is data with a schema, validated at the boundary and executed by a runtime.
- Nothing executable is a code string.
- TypeScript only at the edges.
- Model calls go through signal; agents are cortex.
- Prism transforms; Strata versions.

Everything below is held against these two. Nothing else in Haptic is treated as fixed.

## Position

Keep everything Haptic offers. Change how it is built inside:

- **The artifact stays data and becomes only data.** Today every artifact carries a copy of the crawler, written as JSON program steps: 28,477 bytes, of which the learned selectors are 280. Instead, it holds what discovery learned (selectors, Prism programs, output schema, crawl limits), and Haptic's runtime executes it, the way nova executes a layout and Prism a config.
- **Discovery's and search's control flow moves out of 745 KB of JSON program steps into ordinary TypeScript.** It is built as cortex agents in relay's shape: an agent, a check that runs the candidate for real, one repair run. Prompts, model settings and limits become one data profile the host can override.
- **Search keeps today's contract and becomes modular:**
  - **a search provider is data:** the query URL, the results stage, the redirect wrapper, and how an empty page and a challenge are recognised. DuckDuckGo is the shipped one, and a host can pass its own;
  - **a challenge solver is code:** the image-choice solver asks Jev, through signal, about each tile and submits the form.
- **The model reviewer is replaced by probes.** These are up to three result items and the item count, copied from the page by the agent before it sees any check result, then checked against the final data.

**Cost:**
- About 15,000 test lines and 83 documents describe the old internals and go. The behaviour checks among those tests are rewritten against the new API.
- Each rules attempt at the last level runs a mapping (about 12k tokens).
- **Signal needs a small change** for Jev to see images (decision 1).
- The design is not yet proven on 120b. Step 1 is a pilot that can stop everything; it needs `GROQ_API_KEY` and `TYPESAFE_API_KEY` in this shell.

## What a caller sees

| | Today | After |
|---|---|---|
| Discovery request | `{url, instruction, asOf?, outputSchema?, permissions…}` | the same |
| Discovery result | artifact (data), status, `blocked`, trial, plus review/repair/task/author diagnostics | artifact (data), status, `blocked`, trial, `findings`, `usage` |
| Search request | `{instruction, query?, asOf?, maxFollowResults?, minSuccessfulSources?, maxQueryRewrites?, page?}` | the same; a TypeSafe key is now required for DuckDuckGo |
| Search result | `{instruction, attempts, selected, successfulSources, insufficient, destinations, continuationError}` | the same; each destination's `feedback` carries `findings` instead of the review verdict |
| CAPTCHA on DuckDuckGo | solved by a host adapter the caller writes (Jev) | solved by Haptic (Jev through signal), given a TypeSafe key |
| Search provider | JSON in the search profile | a `SearchProvider` value (data) passed by the host; `duckduckgo` shipped |
| Running an artifact | no AI, current data | the same |
| Host configuration | profiles (settings, limits, selectors; search prompts) | one profile (prompts, settings, limits, transport policy), data |

## How discovery changes the artifact

The artifact is still JSON with a schema, stamped by Strata, and runs with no AI. What changes is what is in it.

**Today** (`tests/fixtures/package/django-news/artifact.json`, 28,477 bytes):
- 14 helper flows (`fetch`, `admit`, `select`, `stage`, `walk`, `redirect`, `batch`, `fetch-resources`, …) written as `$ref`/`$get`/`$case` steps, copied into every artifact;
- the learned rules, 280 bytes, inside a `$const`.

A crawler fix means a Strata upgrade of every stored artifact.

**After** (`nisc.haptic` grammar, version 0; illustrative, built from `suite.json`'s Django fields):

```json
{
  "stamp": { "nisc.haptic": 0, "nisc.prism": 2 },
  "policy": { "linkDepth": 0, "maxPages": 1, "maxRedirects": 3, "stripFragments": true,
              "accept": { "statuses": [200], "mediaTypes": null }, "maxResources": 0 },
  "stages": [
    { "format": "html", "selector": "ul.list-news > li",
      "fields": { "headline": { "selector": ":scope > h2", "attribute": null },
                  "intro":    { "selector": ":scope > p",  "attribute": null } },
      "links": null, "resources": null, "references": null }
  ],
  "mapping": { "$map": { "over": { "$ref": "$.input.pages[0].items" }, "as": "record", "body": { "…": "…" } } },
  "outputSchema": { "type": "array", "items": { "…": "…" } }
}
```

| Stage field | HTML | XML | JSON |
|---|---|---|---|
| `selector`, `fields` | CSS records and fields (`selector`, `attribute`, `closest`) | XPath records, `namespaces`, XPath fields | — (the whole document is the input) |
| `links`, `resources` | CSS for anchors to follow / files to download | — | — |
| `references` | — | a Prism config over the selected records returning `{links, resources}` (today's paired XML rule) | a Prism config over the document returning `{links, resources}` (today's JSON reference program) |

Stage *n* applies at link depth *n*.

Two things are dropped from today's rule shape, because discovery always writes them as constants: `preconditions` (always `[]`), and field `minimum`/`maximum` (always 0/null). The two saved fixtures in `tests/fixtures/package/` predate that and carry them. They are regenerated in step 2, and their precondition checks are lost.

The runtime is `walk`, a TypeScript port of today's `mechanical.json` flows:
- breadth-first by depth;
- alias- and redirect-aware;
- bounded by `maxPages`, `maxRedirects`, `maxResources`, and today's run deadline and item caps.

It uses today's readers and connector. The result is unchanged: `{data, visited, limited, redirects, resources?}`.

```ts
const prepared = prepareArtifact(json);                       // Strata upgrade → Zod → schema checks + Ajv → Prism compile
const result = await prepared.run({ url }, { web, signal });  // web: createWebTransport({ requestHeaders }) or a host transport
```

## Discovery

```ts
const outcome = await discover(request, { model: { apiKey }, profile?, web?, signal?, onEvent? });
// { status: 'ready' | 'unresolved' | 'blocked', artifact, outputSchema, trial, findings, blocked, reason, usage }
```

**Model calls.** Haptic makes the signal client with today's `createModelClient`, which calls `createSignal` with an injected OpenAI SDK. That keeps three things:
- the cancellable `Retry-After` wait;
- the `blocked` outcome;
- the Groq `output_parse_failed` adaptation (`author-output.ts`, `output-rejection.*`).

Signal has none of these itself; moving them into signal is a later, separate case. Every job below is a cortex agent run on that client.

**The profile.** One JSON value with sections `discovery`, `search` and `challenge`, schema-validated, defaults shipped. A host may override:
- the instructions of every Haptic job, but not `prism.mapping`, whose published prompt stays untouched as today;
- model settings per job;
- `modelTransport` (SDK retries, rate-limit policy) and `outputRejections`;
- the HTML preparation policy;
- view and inspection sizes;
- stop limits, and the fresh trial's 30 s cap (`trial.maxActiveMs` today);
- `formats`: media types and suffixes per format, and HTML `urlAttributes`;
- resource defaults (`allowResourceFetching: false`, `maxResources: 4`);
- `discovery.defaults` (`allowLinkFollowing: false`, `linkDepth: 1`, `maxPages: 4`, `maxRedirects: 3`; today's values);
- `search.pageDefaults` (`allowLinkFollowing: true`, `linkDepth: 1`).

Caller fields override them one by one; false and zero are kept.

**`web`:** `createWebTransport(options)` or any host object with the same `get`/`post` shape. It replaces today's `mechanical?: Operations`.

**Order** (`src/discovery/discover.ts`):

1. Check the caller's `outputSchema` before any HTTP or model call, with today's schema rules and Ajv. Without one, run `haptic.schema`. Its result is made optional and nullable throughout, as today, then checked.
2. Fetch the URL. Every HTTP response is kept for the whole discovery (today's "captures"): one fetch per URL, one page count.
3. For each level from depth 0, run `haptic.rules`. If the run ends without passing, run it once more from its last candidate and findings (relay's `repairInput`). The probes stay as first written.
4. **Outcome:**
   - **`ready`, findings empty:** the last level passes.
   - **`ready`, findings set:** the probes still miss, but a candidate exists that walks, maps and matches the schema (today's best-effort rule).
   - **`blocked`:** model quota runs out. A working candidate that already exists is still returned as `ready`, with `blocked` filled in (today's rule).
   - **`unresolved`:** a level has no working candidate. The findings are kept.
5. Before `ready`, run the artifact live through `walk` (today's fresh trial). A failure there means `unresolved`.

| Job | Sees | Returns | Its check (`output.validate`) |
|---|---|---|---|
| `haptic.schema` | instruction, `asOf` | an ordinary JSON Schema | schema rules + Ajv |
| `haptic.rules`, one run per level | instruction, `asOf`, what the caller permits and what is left (depth, pages, resources), output schema, earlier levels' rules and their extracted records (up to 16 KB), and **this level's pages only**. HTML is prepared with today's code, whole when the level totals ≤ 96 KB, else today's windowed view at 96 KB (today 256 KB). XML is original text with the same allowance; JSON is native values | `{ stage, probes }`. HTML stages carry `links` and `resources` selectors. XML and JSON stages carry `references: { links?: "<what to follow>", resources?: "<what to download>" }` in words, which a mapping run turns into the Prism config. Probes are required in any answer that follows nothing further, and frozen at the first such answer | the level check, below |
| `prism.mapping`, published prompt unchanged | `sampleInput`: HTML/XML records cut to the first of each page, at most 16 KB, with a note of how many are shown; JSON documents cut to their first array elements at the same size. `targetShape`: an example built from the schema, or `{links: [url], resources: [url]}` for references. `fieldDescriptions`; `notes`: the instruction or the reference request. **No page** | a Prism config | run it on everything, then Ajv against the target. Probes are not checked here |

`haptic.rules` has one tool, `inspect({ url, query, fields?, offset, limit })`:
- It is today's inspection (CSS or XPath, with per-record fields).
- Each result is capped at 32 KB, and a `ToolGate` denies it after 5 calls per run.
- The model never chooses what to fetch: pages come only from its links and references, under the caller's limits.
- The largest rules request is 96 KB + 16 KB + 5 × 32 KB + prompt, under 300 KB. That is below today's `maxInputBytes` of 524,288. Size is asserted before each call; a failed assertion ends the run.

**Probes**, written by the agent from the page, before any check result:

```ts
probes: {
  count: number | null,                    // top-level items in the result, when it is a list
  examples: Array<Record<string, string>>  // 1–3 result items: first, last, one between. Keys are schema
}                                          // fields or dotted paths ("classes.name"); values are page text
```

**Example rules:**
- Examples use only fields that carry page text. A converted number or date (`19,99 €` → `19.99`) is left out, and the schema alone checks it.
- An example matches one item when every value, after collapsing whitespace, trimming and decoding entities, is contained in that item's value at its path, in string form. Where a path crosses an array, any element may match.

**The level check:**
- Selectors compile, and the stage matches at least once across the level's pages (today's rule; for JSON, the document parses).
- Links and references resolve. The next level is fetched within limits (at least one page), and resources within `maxResources`.
- At the last level, in addition:
  1. `walk` runs the candidate over the kept responses.
  2. Unless the budget is spent, `prism.mapping` runs.
  3. The data must satisfy the frozen probes. Exactly `count` items when the result is a list; each example matches one item.
  4. A candidate that walks, maps and validates is recorded as working, even when its probes miss.
  5. Findings name what happened, for example `11 items, the probes say 10; item 11: {"headline":"","intro":""}, its record's text is "Next"`.

**Stops** (defaults in the profile):
- One budget counter per discovery and one `AbortSignal`: the parent signal (caller's, or search's) plus 13 minutes, today's 780,000 ms.
- Every run gets a `StopCondition` closure (as relay's `passedCheck`). It stops at `finished runs + nested mapping runs + this run's progress.usage` ≥ 300k tokens.
- Mapping runs start only while finished plus nested usage is under 300k. **300k is where runs stop, not a ceiling:** the last rules call plus one mapping run can overshoot by about 90k.
- Per run:

| Job | Stop conditions |
|---|---|
| schema | `stepCount(3)` |
| rules | `stepCount(6)`, `repeatedCalls(2)` |
| mapping | `stepCount(4)` |

- Each run also has a hard time cap through `AbortSignal.any([parent, AbortSignal.timeout(ms)])`: schema 2 min, rules 5 min, mapping 3 min. The mapping run's parent is the rules run.

## Search

The behaviour is today's `docs/development/search.md`, carried over. What changes is that it is TypeScript instead of `search.json`, the provider is a value, and the CAPTCHA is solved by Haptic.

```ts
const result = await search(request, { model: { apiKey }, jev: { apiKey }, provider?, profile?, web?, signal?, onEvent? });
// { instruction, attempts, selected, successfulSources, insufficient, destinations, continuationError }
// destination: { source, artifact, status, trial, execution, usable, feedback }
```

- `provider` defaults to `duckduckgo`.
- `jev` is **required** when the provider declares a challenge, as DuckDuckGo does: 20 of 27 live DuckDuckGo requests on 2026-10-29 were challenge pages.
- `onEvent` streams every request, response and model call, for recording (`scripts/check-search.mjs` depends on this today).

**A search provider is data**, validated by the exported `SearchProviderSchema`. The shipped one (`src/search/providers/duckduckgo.ts`):

```ts
export const duckduckgo = {
  id: 'duckduckgo',
  query: { url: 'https://html.duckduckgo.com/html/', parameter: 'q' },
  accept: { statuses: [200, 202] }, maxRedirects: 3,
  results: { format: 'html', selector: '.result:has(.result__a)',
             fields: { title: { selector: '.result__a', attribute: null },
                       url: { selector: '.result__a', attribute: 'href' },
                       description: { selector: '.result__snippet', attribute: null } },
             required: ['title', 'url'] },
  unwrap: { origin: 'https://duckduckgo.com', pathname: '/l/', parameter: 'uddg' },
  empty: '.no-results',
  challenge: { solver: 'image-choice', detect: '#challenge-form', /* today's image-choice profile */ },
} satisfies SearchProvider;
```

The results stage is read by the same stage reader `walk` uses. `required` means each listed field has exactly one value; a result that breaks it is dropped. **That is a change:** today a card outside its bounds (title and URL 1..1, description 0..1) fails the whole results page. A different search site is another value of this shape, passed by the host. Only a new kind of challenge needs a new solver module.

**A challenge solver is code** (`src/search/challenges/image-choice.ts`). It reuses today's `reader.ts` and `imagescript.ts`, `buildFormSubmission` from `choices.ts`, and the challenge and form schemas from `contracts.ts`:
1. Read `#challenge-form` from the 202 page (POST, form origin in the allowed list).
2. GET every tile from `html.` or `lite.duckduckgo.com` (status 200 each).
3. Pad the tiles with ImageScript (an optional peer, as today).
4. **One `signal.decide` call to Jev**, one yes/no question per tile. Signal's own rule (`answer` is `noul ≥ 0.5`) picks the tiles, replacing today's threshold and Prism selection. This needs decision 1.
5. POST the hidden fields, the chosen checkboxes and the submit button (status 200).
6. Read `#success-form` and POST it.
7. Follow 301/302/303, at most 3, within the allowed origins.

Measured on 2026-10-30, the whole step took 2.1 s and one Jev call (3,873 input tokens, 483 ms).

**The POSTs** go through the connector's `post`, a new method on the same `node:http(s)` client as `get`. It carries the headers of the recorded successful request: no `user-agent`, `Accept-Encoding: identity`, `Origin`, `Referer`. An earlier attempt was re-challenged when its POST went through `fetch`. The measurement says the client switch is not proven to be the cause, and this exact combination has never run; the pilot's live search covers it.

**Order** (`src/search/search.ts`), all under one `AbortSignal`: the caller's signal plus 13 minutes for the **whole search**, today's single deadline. Every `discover` gets it as parent.

1. Before any fetch, check `minSuccessfulSources ≤ maxFollowResults`.
2. The query is `query` or the instruction.
3. Fetch the provider page.
   - A challenge → its solver, once; the recovered page must be 200 with results or the empty marker.
   - The empty marker → no results.
   - Anything else → failure.
4. Read the results, unwrap the redirect URLs, remove fragments, drop duplicates on the page and URLs already attempted.
5. `haptic.rank` (jobs table below) returns `{rankedIds}`.
6. `discover` each chosen URL in order, with the instruction, `asOf` and `search.pageDefaults` overridden by the caller's `page`. Each attempt spends one follow slot, success or not.
7. **Rewrite** only when all four hold: follow slots remain, rewrites remain, the queue is empty, and usable sources are below the minimum. Then `haptic.rewrite` returns a new query or null. Null ends the search. A repeat of an earlier query is sent back as a finding within the job's steps. A new query starts again at step 3. Reaching the minimum never stops the queue early.
8. **Failures:**
   - In the first round, a failed provider page or ranking fails the search.
   - In a later round, a failed rewrite, provider page or ranking becomes `continuationError: {phase: 'rewrite' | 'search', error}` when at least one source is usable; otherwise the search fails.
   - Cancellation and integrity errors always end the search.

**Usable** (today's rule, `search.json` `search-destination`):
- an artifact exists, its status is `ready`, its final trial completed with no error, and its output is non-empty unless the caller supplied a schema;
- `ready` with findings counts as usable, as a negative review does today. The findings are in the destination's `feedback`, so a caller can filter on them.

`successfulSources`, `insufficient` and the rewrite condition count usable destinations. `execution` is the final trial's result, so search does not fetch a third time.

| Job | Sees | Returns | Its check (`output.validate`) |
|---|---|---|---|
| `haptic.rank` | instruction, query, `asOf`, the remaining follow slots (`maxResults`), the per-destination page limits, earlier destinations' outcomes (status, reason, findings), and each candidate's id, title, description and URL | `{ rankedIds }` | ids known, unique, at most the remaining slots. A failure is sent back within `stepCount(3)`; still failing fails the round. **New:** today a bad id list fails at once, with no second ask |
| `haptic.rewrite` | instruction, `asOf`, earlier queries, earlier destinations' outcomes (status, reason, findings; no pages, no artifacts) | `{ query: string | null }` | not a repeat of an earlier query, within `stepCount(3)` |

Both keep today's prompts, with "review/trial reasons" reworded to "findings and reasons".

**Search budget:** search's own calls (rank and rewrite about 1–2k tokens each; Jev about 4k) plus each discovery's own budget, under the one 13-minute deadline. The token worst case is about 5 × 390k for five destinations. The recorded 2026-10-30 run used 293k reported tokens for 2 artifacts.

## Hand traces

The mechanical parts ran on real pages with Haptic's own preparation code:
- Django and SQLite: saved captures in `tests/fixtures/package/`.
- Spiegel: a live fetch on 2026-11-06.
- The search trace follows the recorded run of 2026-10-30.

No model ran; the replies are what each job is asked to produce.

**Django weblog**: caller schema `[{headline, intro}]`, no links.
1. One response, 54,715 bytes prepared (about 15.6k tokens). It fits whole.
2. Rules, call 1 (about 18k in): it sees `<ul class="list-news"><li><h2><a>Quarterly contributor outreach</a></h2>…<p>The Steering Council is reaching out…</p>` and answers:
   - `ul.list-news > li` with fields `:scope > h2` and `:scope > p`;
   - probes: `count: 10`, plus the first and last items.
3. Check: 10 records. Mapping (about 12k: Prism's documentation is 28,333 characters, about 7.4k tokens, plus the sample) gives 10 items. Probes match. It passes.
   - With `main li` instead, there would be 11 records. The 11th is the pagination `<li><a class="next" href="?page=2">`, the mapping gives 11 items, and the finding returns to the rules agent with the probes unchanged.

Total: 2 calls, about 30k input tokens.

**SQLite release notes**: no schema, links allowed, `linkDepth: 1`, `maxPages: 4`.
1. Schema (about 1.5k): `[{ version, released, changes: [string] }]`, then made optional and nullable.
2. Rules, level 0: the chronology is 90,747 bytes prepared (about 26k) and fits. It answers `links: "#chrontab tbody tr:nth-child(-n+3) td:nth-child(2) a"`. Check: `3_54_1`, `3_54_0` and `3_53_4` are fetched; 4 of 4 pages used.
3. Rules, level 1: **only the 3 release pages** (9,131, 8,602 and 11,540 bytes, about 9k), plus the 3 level-0 records. It answers `h2, ol.lessindent`, with probes `count: 3` and examples `{version: "3.54.1"}`, `{version: "3.53.4"}`. Check: 3 + 2 + 3 records; the mapping groups them into 3 items. Probes match.

Total: 4 calls, about 53k.

**Spiegel top 10** (450,773 tokens in its recorded run).
1. 1,496,428 bytes prepared, 9,945 elements. The first `<article>` is at byte 31,623; the first ten `article` elements total 38,864 bytes.
2. Rules, call 1 (about 29k): the 96 KB view shows 11 `article` elements. The first five are a `<nav>` news ticker repeating main teasers.
3. Call 2: `inspect` of `article` 0–10 returns items 0–7 within 32 KB. The answer is a selector scoped to the main teasers, with probes copied from the page: `{headline: "US-Regierung will trotz Kriegs nach Iran abschieben", link: "https://www.spiegel.de/ausland/iran-krieg-…"}` and two more.
4. Mapping: about 12k. The sample is 16 KB; the run covers all ~190 records.

Total: 4–5 calls, about 80–125k. A retry adds about 60k.

The recorded bad run put descriptions in some headline fields. Probes catch that only when an example falls on such a row.

**Search: "Show me a list of ai meetups in Vienna!"** (recorded 2026-10-30):
1. DuckDuckGo answers 202 with a nine-tile challenge. The solver fetches the tiles, Jev decides in one call, the form and then the success form are posted, and the 302 is followed: 200 with ten results. That took 2.1 s.
2. `haptic.rank` sees the ten results (about 1–2k tokens; the 2026-10-31 ranking calls averaged 1.2k) and returns up to five ids. The recorded run ranked with Jev, which was replaced by 120b ranking the next day.
3. Five `discover` runs follow. The recorded run got two artifacts, a stream error, an exhausted author and a 403, from 14 model requests (usage reported for 13; 287k tokens). Under this design each destination costs one discovery, typically 30–120k.
4. One recorded artifact was the Meetup group with an overbroad selector: eight entries for four events, two of them blank anchors. Probes of `count: 4` and the four titles would fail the 8-item result, and that finding returns to the rules agent. If it still misses, the destination is `ready` with findings and counts as usable, with the findings visible.

## How this differs from the failed 2026-11-01 attempt

`docs/measurements/source-grounded-discovery-2026-11-01.md` records the causes:

| Cause recorded there | Here |
|---|---|
| Selector writing and Prism program writing in one prompt: the model answered with the events instead of a program | Only `prism.mapping` writes programs, with its published prompt. The rules agent writes selectors, example items and, for XML and JSON, the references in words |
| The whole prepared HTML (267,829 characters) resent on every call | One run per level with only that level's pages; a 96 KB view; inspections capped at 32 KB × 5; one budget counter. The mapping job sees a 16 KB sample, never a page |
| Recovery explained structure only | Findings carry the actual counts and items |
| Relevance mistakes (the Meetup "AI" substring) | **Not fixed.** Probes catch an extraction that disagrees with what the agent read, not a misread instruction |

## Limits this design accepts

- **Probes are only as good as the agent's first reading.** A wrong count or example is frozen in. It either fails a correct candidate (still returned `ready` with findings) or confirms a wrong one.
- **A level's choice is final.** A wrong link choice at level 0 cannot be revisited from level 1. Today's review-driven repeat re-ran from level 0.
- **The generated schema is written before the page is seen, and never rewritten.** Today it is written after extraction and may be rewritten after review. A field the page does not have passes as `null` everywhere.
- **Converted fields** (numbers, dates) are checked by the schema only.
- **Search ranking sees only result metadata**, as today.

## Budget

| What | Requirement | Today |
|---|---|---|
| Input tokens per discovery | traces 30k / 53k / 80–125k; **average ≤ 60k** over the 17 cases; runs stop at 300k (can end near 390k) | about 100k average; 450,773 for one Spiegel run |
| Model calls per discovery | typically 2–5 | 5–11 measured, about 9 average |
| Search overhead | rank and rewrite 1–2k each, Jev about 4k, 2–3 s for a challenge | the same calls |
| Time | discovery median no worse than the old pipeline the same day; 13-minute stop per discovery, and one for a whole search | 48–85 s per discovery; one 13-minute deadline per run |
| Quality, 17 cases × 2 | complete ≥, unusable ≤ and unresolved ≤ the old pipeline the same day | 24 / 2 / 4 on 2026-11-03 pages |
| Finished-artifact run | no slower on the same pages | 371 ms Anima, 215 ms Spiegel |

A test in `scripts/` fails a run that exceeds the stops.

## Build order

0. **Signal case** (decision 1): `decide` forwards an `assets` object and one configured header to the TypeSafe (`systemone`) endpoint. It is a separate signal session and release.
1. **Pilot (a script, not package code)** on four cases: Django and SQLite from saved captures, Spiegel from one frozen capture, and one live search ("Show me a list of ai meetups in Vienna!").
   - **Pass:**
     - Django equals `expected.json` data.
     - SQLite visits the same 4 pages. Each of its 3 items has its page's version and date, and its change texts contain the page's `ol.lessindent` text (whitespace collapsed).
     - Spiegel: at least 8 of its 10 links are in a top-10 reference list written by a fresh blind subagent from the frozen capture. Every item's headline and description belong to its own link.
     - Search: results are acquired (with a solved challenge if one appears), ranked, and at least two destinations are usable artifacts that run again with no AI.
     - Input tokens within 40k / 80k / 180k per discovery.
   - **Miss:** I stop and bring the raw replies and numbers.
2. `src/artifact/`: schema, `prepareArtifact`, `walk`. The fixtures are regenerated; reader and transport tests kept; `walk` tests on the saved pages.
3. `src/discovery/`: `discover`, the jobs, the level check, probes, the budget counter, the profile. Today's behaviour checks are rewritten against `discover`: permission ceilings, false/zero overrides, one page count, `blocked`, cancellation, fresh trial.
4. `src/search/`: `search`, `SearchProviderSchema` and `duckduckgo`, the image-choice solver, the connector's `post`. Today's search loop checks are rewritten against `search` (21 groups in `search-ranking-cleanup-2026-10-31.md`: id checks, false/zero overrides, no fallback, duplicates, rewrite conditions, `continuationError`, cancellation).
5. Strata grammar `nisc.haptic`. It replaces `strata/snapshots/eden.engine` and `strata/corpus/haptic/*`, and updates `scripts/check-grammars.mts`, `check:package` (in `verify.yml`) and the `.changeset`.
6. **Comparison:**
   - Both pipelines run live the same day, with every response frozen.
   - Fresh blind subagents write reference contracts from the frozen pages in the format `benchmarks/qualification-support.mjs` grades. Today's `originalContracts` file is in the ignored `data/` and not on this machine.
   - Further blind subagents bind each run's schema keys to the contract roles.
   - Cost: the old pipeline used 3.4M input tokens for 34 runs; the new one is expected at about 2M.
   - Miss → stop and report; the old pipeline stays.
7. Delete the old pipeline and interpreter. Docs become README, DESIGN and STATUS.

## What stays, goes and is new

| Part | Lines |
|---|---|
| Kept unchanged: `src/connector` (316, plus `post`), `src/readers` (867), `model-transport.ts` + `author-output.ts` + `output-rejection.ts` (380), `engine/json.ts`, `errors.ts`, `schema-admission.ts`, `contracts.ts` (213), image-choice `reader.ts` (81) | about 1,860 |
| Kept, rewrapped or reduced (they import the deleted `engine/operation.ts` or a type from a deleted file, or lose their raw-Jev parts): `src/discovery/html-*.ts` (842), `src/operations/{web,json,url,xml,http-source}.ts` (571), `engine/control.ts` (89), image-choice `imagescript.ts` (91), image-choice `choices.ts` + `contracts.ts` (186 → about 90: `buildFormSubmission` and the challenge/form schemas stay; `buildVisionRequest`, `readVisionResponse`, `selectImageChoices` and the vision schemas go) | about 1,680 |
| New: artifact + `walk` (about 450), discovery (about 800), search + provider + solver (about 400) | about 1,650 (estimate) |
| Deleted: the interpreter (591), the rest of discovery's TS including `model.ts` (about 2,860), search wiring (`index.ts`, `ranking.ts`, image-choice `index.ts`: 389), all workflow JSON (745 KB) | — |
| Tests: reader, transport and image-choice tests kept; the rest (about 15,000 lines) tested the JSON pipeline; behaviour checks rewritten in steps 3–4 | — |

Afterwards: about 5,200 lines of TypeScript, plus the profile and provider data. Today: 7,511 lines plus 745 KB of workflow JSON.

## Breaking changes

There are no users: no app depends on it and it is unpublished. CI and scripts are changed in step 5.

- **Artifacts:** `eden.engine` artifacts no longer run (decision 2).
- **Removed exports:**
  - `defineOperation`, `Operations`, `Flow`/`Step`/`Artifact` schemas, `engineProfile`, `Limits`, `createWebOperations`;
  - `discoveryWorkflow`, `createDiscoveryOperations`, `searchWorkflow`, `createSearchOperations`, `imageChoiceWorkflow`, `createImageChallengeRecovery`;
  - their profile schemas;
  - `./migrations`' `ENGINE_*`.

  They are replaced by `prepareArtifact`, `createWebTransport`, `discover`, `search`, `duckduckgo`, and the profile, provider and artifact schemas.
- **The profile** keeps its kinds of content in a new shape: one value, three sections, no flow ids or phase names.
- **Discovery result:** `review`, `repair`, `partialTrial`, `task` and `author` give way to `findings` and `usage`.
- **Search result:** the same fields; destination `feedback` carries findings instead of a review verdict.
- **Search host adapters** (`recoverSearch`, `decideImages`, `postForm`, `prepareImages`) give way to `jev: { apiKey }`, with Haptic doing the work.
- **Search with DuckDuckGo needs a TypeSafe key.** Today it can be called without one, but on 2026-10-29, 20 of 27 live requests were challenge pages.
- **Search provider results:** a malformed result is dropped instead of failing the page.
- **Ranking:** a bad id list gets a second ask before the round fails.

## Positions this changes

| Haptic position | After |
|---|---|
| "JSON owns prompts, model settings, decisions, budgets, traversal and repair policy. TypeScript implements generic interpreters" | **Changed.** Prompts, settings and limits are data in the profile (today discovery's prompts sit inside its workflow JSON). Control flow, traversal and repair are TypeScript. The artifact is pure data run by Haptic's runtime |
| An artifact carries its own crawler as JSON steps | **Changed.** It carries only what was learned |
| "no native validation callback runs trials or chooses repairs" | **Reversed.** `output.validate` runs the check, and its findings drive the retry |
| A final-data reviewer gives an advisory verdict | **Replaced** by probe findings, also advisory |
| The schema author runs after extraction and may be rewritten after review | **Changed.** It runs first, from the instruction, because probes need its field names (see Limits) |
| Review feedback repeats the pipeline from level 0 | **Changed.** Each level is final once it passes |
| Search CAPTCHA recovery is host-injected | **Changed.** Haptic solves DuckDuckGo's image challenge itself, with Jev through signal |
| Everything else: best effort, no AI at run time, Prism mapping by its published agent, inspection cannot fetch, caller schema immutable, permissions as ceilings, one page count, fresh live run before `ready`, search's ranking, rewrite, follow slots, minimum, usable rule, `continuationError`, one deadline | Kept |

## Decisions

1. **Signal's `decide` carries images**, so Jev is called through signal and not by raw HTTP inside Haptic.
   - The change is to **signal's public `decide` request**: `DecideRequest` gains optional `assets` and `headers`, which `decideCalibrated` passes to the adapter. The `systemone` adapter then sends them (images, plus `TypeSafe-Danger-Zone-Images: true`).
   - It is additive: existing callers are unaffected.
   - If you say no, `search` takes `decideTiles(challenge, tiles, signal) → ids` from the host instead of `jev`, as today's `decideImages`.
2. **No saved `eden.engine` artifacts need to keep running.** I found none outside this repo. If some exist, step 5 adds a Strata upgrade that:
   - lifts their learned rules and output mapping out of the old flow;
   - drops their preconditions and match bounds.
