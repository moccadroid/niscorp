# Haptic design

Discovery asks a model small questions that code can check, and writes what it learned as data. The artifact holds only that data (selectors, Prism programs, an output schema, crawl limits); Haptic's runtime executes it, the way Prism executes a config. Model calls go through signal, every checked model question is a cortex agent, Prism shapes the data, Strata versions the grammar.

## The artifact (`nisc.haptic` grammar, version 0)

Perl's free online books, as discovery wrote it (`tests/fixtures/discovery/perl.json`):

```json
{
  "stamp": { "nisc.haptic": 0, "nisc.prism": 3 },
  "policy": {
    "maxPages": 21,
    "maxRedirects": 3,
    "stripFragments": true,
    "accept": { "statuses": [200] }
  },
  "stages": [
    {
      "kind": "records",
      "format": "html",
      "render": false,
      "selector": "div.col-12",
      "fields": {
        "title": { "selector": "h3", "attribute": null },
        "link": { "selector": "p.description a", "attribute": "href" }
      },
      "required": ["title", "link"],
      "where": { "in": "text", "contains": "the entire book free online" },
      "limit": null
    }
  ],
  "mapping": { "$map": { "over": { "$ref": "$.records" }, "as": "r", "body": { "…": "…" } } },
  "outputSchema": { "type": "array", "items": { "…": "…" } }
}
```

- **Stages** run in order, one per level of pages: link or reference stages first, one record stage last.
  - HTML record stage: CSS for one record, field rules (`selector`, `attribute`, optional `list`, optional `closest`), `required` (a record without a non-empty value for one of these fields is not an item), `where` (kept when that field, or the record's text, contains the phrase, compared with case, whitespace, dashes and quotes folded), `limit` (the first N records of each page). Order per page: required, where, limit.
  - HTML link stage: CSS for the link records, the link rule, `limit` (distinct addresses not yet visited).
  - `render: true`: the level's pages run their own inline scripts before anything reads them.
  - `resources` on an HTML stage: CSS for files to download (up to `policy.maxResources`).
  - XML record and reference stages: XPath records, namespaces, XPath fields; a reference stage's Prism program returns `{ links, resources }`. JSON: a record stage makes each page's document one record; a reference stage's program over the document returns `{ links, resources }`.
- **The program** sees `{ records }`, the last level's records from all pages in page order. Each HTML record is `{ sourceUrl, text, attributes, fields }`: text with whitespace collapsed, addresses resolved, one value per field (a list for `list` fields).
- **A run** returns `{ data, records, visited, redirects, limited, resources, emptyPages, broken }`. `limited`: a stage had more pages than `maxPages` left room for. `broken`: a page of the last level gave no records, so the artifact no longer fits it.
- **Versions**: `prepareArtifact` upgrades an older stamp through Strata (`HAPTIC_SEQUENCE` with Prism's sequence) before checking it. A change to the artifact schema appends a migration; `pnpm check:grammars` at the repository root holds the grammar to its snapshot and upgrades the captured artifacts in `strata/corpus/haptic`.

## Discovery

One entry point, `discover`, one module per step (`src/discovery/`):

| Step                                                                                                                                                                                                                              | Module                 | Model                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| The page as numbered text lines; each line knows its element                                                                                                                                                                      | `view.ts`              | —                                                                          |
| A text view over 64 KB: Jev picks the section to read                                                                                                                                                                             | `sections.ts`          | Jev, one choice                                                            |
| **Read**: cite up to 5 example items by line, count them, the limit asked for, or the links to follow and what to take from each linked page                                                                                      | `read.ts`              | 120b, cortex agent; code checks every citation and sends the problems back |
| The link rule for the cited links; the next level's task without line numbers                                                                                                                                                     | `links.ts`             | —                                                                          |
| Record and field rules that give every cited example; the list nearest Read's count                                                                                                                                               | `rules.ts`, `lists.ts` | field rules from 120b only when code finds none                            |
| Which uncited records answer the instruction                                                                                                                                                                                      | `members.ts`           | Jev, one yes/no per record, 25 per call                                    |
| One phrase that keeps those and drops the rest: the stage's `where`                                                                                                                                                               | `phrase.ts`            | —                                                                          |
| The program: a copy of the fields when nothing is left to filter, else Prism's mapping agent, checked against the examples and asked once to match the labels                                                                     | `program.ts`           | 120b, Prism's published agent                                              |
| Findings: cited examples missing or lost, label mismatches, "N items, the reader counted M"                                                                                                                                       | `findings.ts`          | —                                                                          |
| Rendering: when a level has 3+ links sharing one address with different texts (a script sets the real addresses), every page of the level is rendered                                                                             | `../render/`           | —                                                                          |
| One attempt through the levels                                                                                                                                                                                                    | `attempt.ts`           | —                                                                          |
| The ladder: an attempt at low effort; a stop or a finding other than the count runs it again at high; the first stands unless the second is strictly better. Then the artifact runs once on fresh pages with no model (the trial) | `discover.ts`          | —                                                                          |

Every model call goes through one module (`calls.ts`): it counts tokens, stops new calls at the input-token cap (400k per discovery), allows 250 Jev questions per attempt (one per record labelled or section chosen; up to 25 records go in one call), treats an empty provider reply as no answer, and reports a provider rate-limit block as `blocked`. Every text a model reads is in `prompts.ts`, word for word as approved.

## Search

`search` (`src/search/`): the provider page for the query; its image challenge when one appears (`image-challenge.ts`: fetch the tiles, one Jev question per tile, post the chosen tiles and the success form, follow the redirects within the allowed origins); the results unwrapped and de-duplicated; a cortex agent ranks them; `discover` runs on each in order, each spending one follow slot. When the queue is spent, follow slots and rewrites remain and too few sources are usable, a cortex agent rewrites the query. A failure in a later round becomes `continuationError` when a source is already usable. A provider is data (`SearchProviderSchema`); `duckduckgo` is the shipped one.

## Rendering

jsdom runs the page's own inline scripts with no network and no external files, 600 ms for timers. It runs in a child process under Node's permission model (it reads only its own folder and jsdom's, writes nothing, starts no process), with an empty environment, killed after each page or at 15 s. A page that cannot be rendered is read as fetched. Node's permission model does not close the network; a host that needs that wraps the process in an OS sandbox.

## Modules

| Module                        | Question it answers                                                              |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `artifact`                    | What is an artifact, and how does one run with no model?                         |
| `web`, `connector`, `readers` | How are pages fetched and their bytes read (bounded HTTP, HTML and XML readers)? |
| `render`                      | When and how does a page run its own scripts?                                    |
| `discovery`                   | How does an instruction and an address become an artifact?                       |
| `search`                      | How does an instruction alone become artifacts for several sources?              |
| `migrations`                  | Which grammar and schemas describe a stored artifact?                            |
