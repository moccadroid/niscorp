# Writing an artifact

An artifact is JSON data: where the items are on a page, which values to take from each, and how to shape the result. Haptic runs it with no model. Discovery writes artifacts from an instruction, but anyone can write one: a person, a model given this page, or a tool. Haptic checks it and runs it the same way.

## The smallest artifact

The free books on `https://www.perl.org/books/library.html`, written by hand:

```json
{
  "policy": {
    "maxPages": 1,
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
  "mapping": {
    "$map": {
      "over": { "$ref": "$.records" },
      "as": "r",
      "body": {
        "title": { "$get": { "from": { "$var": "r" }, "path": ["fields", "title"] } },
        "link": { "$get": { "from": { "$var": "r" }, "path": ["fields", "link"] } }
      }
    }
  },
  "outputSchema": {
    "type": "array",
    "items": { "type": "object", "required": ["title", "link"] }
  }
}
```

Each `div.col-12` is one record. Records without a title or link are left out, and so are records whose text does not mention "the entire book free online". The mapping turns each remaining record into `{ title, link }`. `stamp` can be left out: an artifact without one is read as written for the current grammar, and `prepareArtifact` adds the current stamp.

## Check, inspect, run

```ts
import { createWebTransport, prepareArtifact } from '@niscorp/haptic';

const prepared = prepareArtifact(artifact); // throws ArtifactError naming every problem it finds
const web = createWebTransport();
const seen = await prepared.inspect({ url }, { web, signal: AbortSignal.timeout(60_000) });
web.close();
```

`prepareArtifact` checks the artifact once, in this order, and stops at the first check that fails. The error lists every problem that check found, each with its place in the artifact:

| `ArtifactError.code` | What is wrong                                                                                              | Example message                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `UPGRADE`            | The `stamp` names a grammar version that cannot be upgraded.                                               |                                                                                                |
| `GRAMMAR`            | A key is missing, unknown or of the wrong type, or `required` or `where.in` names a field the stage lacks. | `stages.0.where.in: "price" is not a field or "text"; this stage's fields are "title", "link"` |
| `SELECTOR`           | A CSS selector the HTML reader cannot run, or an XPath expression that does not parse.                     | `stages.0.fields.title.selector: "h3[" is not CSS the reader runs (…)`                         |
| `PROGRAM`            | The mapping or a reference program is not a valid Prism program.                                           | `mapping: $mapp: Not a Prism op. …`                                                            |
| `OUTPUT_SCHEMA`      | `outputSchema` is not a JSON Schema.                                                                       |                                                                                                |

`inspect` runs the artifact exactly like `run`, but it does not throw when the run stops. It returns:

- `pages`: one entry per page at each stage, in order.
  - A link or reference stage gives the addresses that page led to. For a link stage, it also gives `selected`, the number of elements its selector matched.
  - A record stage gives these counts:
    - `selected`: elements its selector matched;
    - `missing`: elements left out because a `required` field had no value, counted under the first such field;
    - `failedWhere`: elements left out by `where`;
    - `duplicates`: records whose fields equal an earlier record's;
    - `pastLimit`: elements not read because `limit` was reached;
    - `kept`: records kept;
    - `empty`: for each field, how many kept records have no value for it.
- `records`: the records the mapping received. These are there even when the mapping failed or its result did not fit `outputSchema`.
- `result`: what `run` returns, or `null` when the run stopped.
- `error`: why the run stopped, with the code of the error that stopped it, or `null`. Examples: `STATUS` (an HTTP status not in `policy.accept.statuses`), `NO_PAGES` (a link stage found nothing to follow), `PROGRAM` (the mapping failed on these records), `SCHEMA` (the result does not fit `outputSchema`).

A selector that matches nothing shows as `selected: 0`. A field rule that matches nothing in the kept records shows as `empty` equal to `kept`.

## Reference

### Top level

| Key            | Meaning                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `stamp`        | Optional. The grammar versions it was written for, e.g. `{ "nisc.haptic": 0, "nisc.prism": 3 }`.                                              |
| `policy`       | Limits of one run (below).                                                                                                                    |
| `stages`       | One stage per level of pages: link or reference stages first, exactly one record stage last.                                                  |
| `mapping`      | A [Prism](https://github.com/moccadroid/niscorp/blob/main/packages/prism/DOCS.md) program over `{ records }`; its result is the run's `data`. |
| `outputSchema` | JSON Schema the result must fit; `{}` accepts anything.                                                                                       |

`policy`: `maxPages` (pages one run may fetch, the start page included), `maxRedirects` (per page), `stripFragments` (drop `#…` from followed addresses), `accept.statuses` (e.g. `[200]`), optional `accept.mediaTypes` (accepted content types; absent or `null` accepts any), optional `maxResources` (files a run may download; absent means none).

### HTML stages

A **record stage** (`"kind": "records", "format": "html"`):

| Key         | Meaning                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render`    | `true` runs the page's own inline scripts before reading it (no network; for addresses or content that a script writes).                                         |
| `selector`  | CSS for one record.                                                                                                                                              |
| `fields`    | Field name to a field rule (below).                                                                                                                              |
| `required`  | Field names; a record without a non-empty value for one of them is left out.                                                                                     |
| `where`     | `null`, or `{ "in": <field name or "text">, "contains": <phrase> }`: kept when that value contains the phrase, with case, whitespace, dashes and quotes ignored. |
| `limit`     | `null`, or the first N records of each page that pass `required` and `where`.                                                                                    |
| `resources` | Optional `{ "selector", "attribute" }`: files this page leads to, downloaded up to `policy.maxResources`.                                                        |

A record stage also leaves out every record whose fields all equal an earlier record's (one link behind its text, its image and its file name is one item).

A **field rule**: `selector` (CSS inside the record; `:scope` is the record itself; a list like `"p, li"` is allowed), `attribute` (`null` reads the text; a name reads that attribute, and `href` values are resolved to absolute addresses), optional `"list": true` (every match instead of the first), optional `closest` (CSS for the nearest element at or above the record to run the selector in instead, e.g. the table row a cell belongs to).

A **link stage** (`"kind": "links", "format": "html"`): `render`, `selector` (CSS for one link record), `link` (a field rule reading the address), `limit` (`null` or how many distinct addresses not yet visited to follow), optional `resources`. Its pages' addresses become the next stage's pages.

CSS is what [css-select](https://github.com/fb55/css-select) runs, limited to structure: tags, classes, ids, attributes, combinators, and the pseudo-classes `:first-child`, `:last-child`, `:only-child`, `:first-of-type`, `:last-of-type`, `:only-of-type`, `:nth-child()`, `:nth-last-child()`, `:nth-of-type()`, `:nth-last-of-type()`, `:not()`, `:has()`, `:contains()`, `:icontains()`, `:empty`, `:scope`. Merged table cells (`rowspan`) are copied into every row they cover before selectors run.

### XML and JSON stages

- **XML record stage** (`"kind": "records", "format": "xml"`): `selector` (XPath 1.0 selecting the record elements), `namespaces` (prefix to namespace URI; `{}` for XML without namespaces), `fields` (field name to an XPath expression relative to the record), `required`, `where`, `limit`.
- **XML reference stage** (`"kind": "references", "format": "xml"`): `selector`, `namespaces`, `fields` as above, `references` (a Prism program over `{ records }` returning `{ links?: [address], resources?: [address] }`), `limit`.
- **JSON record stage** (`"kind": "records", "format": "json"`): no other keys. Each page's whole document is one record.
- **JSON reference stage** (`"kind": "references", "format": "json"`): `references` (a Prism program over `{ document }` returning `{ links?, resources? }`), `limit`.

### What the mapping receives

`{ records }`: the last stage's records from all its pages, in page order.

- HTML record: `{ sourceUrl, text, attributes, fields }`. `text` is the record's text content as it appears in the page. `attributes` are the record element's own attributes. `fields` has one value per field rule: a string or `null`, or a list for `list` fields. Text values have whitespace collapsed. `href` values are absolute addresses.
- XML record: `{ sourceUrl, text, fields }`; a field is a list of texts for a node-set, or a string, number or boolean.
- JSON record: `{ sourceUrl, document }`.

### What a run returns

`{ data, records, visited, redirects, limited, resources, emptyPages, broken }`. `limited` means a link stage had more pages than `policy.maxPages` left room for. `broken` means a page of the last stage gave no records, so the artifact no longer fits that page.

## Patterns

- **The record holds every field.** The record selector picks the smallest element that contains all of an item's fields. When a post's title sits outside its `<article>`, the record is the element around both, e.g. `main`.
- **The record is the value.** When each item is a single element, such as one link, select that element as the record and read it with `"selector": ":scope"`: `{ "selector": ":scope", "attribute": "href" }` gives its address and `{ "selector": ":scope", "attribute": null }` gives its text.
- **Records found by what comes before them.** Combinators work across the page. `h4:contains("Legacy versions") ~ table a` gives the links in the tables after that heading. `center:has(h4:contains("Legacy versions")) ~ table a` does the same when the heading is wrapped in another element. `a[href$=".tar.gz"]` keeps only addresses that end that way.
- **A list field goes through as a list.** `{ "$get": { "from": { "$var": "r" }, "path": ["fields", "body"] } }` on a `list` field gives an array of strings. Each value has its whitespace collapsed, so a code block becomes one line.
- **A result that is not objects.** A `$map` body can be a single value. With `"body": { "$get": { "from": { "$var": "r" }, "path": ["fields", "link"] } }`, the result is a list of addresses.
- **Keep some records in the mapping** when `where` cannot say which ones. Wrap `$.records` in `$filter` and map over that:

  ```json
  {
    "$filter": {
      "over": { "$ref": "$.records" },
      "as": "r",
      "when": {
        "$endsWith": {
          "value": { "$get": { "from": { "$var": "r" }, "path": ["fields", "link"] } },
          "suffix": { "$const": ".tar.gz" }
        }
      }
    }
  }
  ```

  Comparing, numbers from text (`$toNumber`), splitting (`$split`), dates and local variables (`$with`) are all Prism ops. They are listed in [Prism's DOCS.md](https://github.com/moccadroid/niscorp/blob/main/packages/prism/DOCS.md).
