# Interactions: requests, inputs, and more pages

Status: built (2026-11-15). Version 2 of the design, after one independent review (NO, eight findings, all folded in). All 2,407 saved artifacts with a capture replay identically; blind live check day 1: 7 of 8 complete (dict.org's 19 headwords are all right, its addresses spell an apostrophe as %27 where the reference has '); day 2 is owed.

## The problem

Today an artifact reads what one GET of an address gives, then follows links. It can't ask for the next page, send a search, or post a form. So a list that continues on page 2 stops at page 1. A search must be built into the address by whoever calls `run`. JSON feeds behind "load more" and every POST or GraphQL source are out of reach. These pages need no browser. Their data comes from plain requests that Haptic's transport can already send.

Measured on 2026-11-15 with Haptic's own transport, no cookies:

| Page | What it needs | Seen |
| --- | --- | --- |
| Hacker News | a page counter | `a.morelink` → `?p=2`; 30 stories a page, none shared by pages 1 and 2; page 40 has 0 stories and no link |
| Hacker News, newest | the next link, which carries a cursor | `newest?next=50507305&n=31`: the id can't be counted |
| Lobsters, newest | the next link | `/newest/page/2?last_read_timestamp=0` |
| GitHub releases (nodejs/node) | a page counter | page 2 links to `?page=3`; 600 kB a page |
| dev.to | a JSON page counter | `feed_content?per_page=15&page=N`: 15 a page; page 200 answers `result: []` |
| HN Algolia | a JSON page counter, an input | `search_by_date?tags=story&page=N`: 20 hits, `nbPages` 50 |
| npm search | an offset, an input | `-/v1/search?text=X&size=20&from=N`: total 481, `from=480` gives 1 |
| GitHub API releases | a JSON page counter, inputs | `?per_page=5&page=N` |
| DuckDuckGo (html) | a form POST, an input | POST `q=…`: 10 results |
| countries GraphQL | a JSON POST | 250 countries |

Not reachable, and left out: Reddit answers 403 (old.reddit 302), Mastodon's public timeline needs a sign-in, and GitHub's commit pages answered 429. No page above needed cookies (GitHub and npm set some, and the answers are the same without them). So a session per run is not in this design. It comes back when a real page needs it.

## The design

Three additions. Paging lives in one place: the pages a run starts from.

### 1. `inputs`: named values a run is given

```json
"inputs": { "query": { "description": "What to search for, in words." } }
```

`prepared.run({ inputs: { query: "haptic feedback" } }, { web, signal })`. An input is a string. A run without every declared input is refused, and so is one with an input the artifact doesn't declare. The descriptions are for whoever calls: a person, or later a model choosing what to pass.

### 2. `request`: the first request, as a template

Today the first page is the `url` given to `run`. An artifact may instead carry its first request:

```json
"request": {
  "method": "POST",
  "url": "https://html.duckduckgo.com/html/",
  "headers": {},
  "body": { "form": { "q": "{query}" } }
}
```

- `method` is `GET` or `POST`. `url` is required.
- `headers` go on top of the transport profile's headers. For a header named in both, the artifact's wins.
- `body` is `{ "form": {…} }` (sent form-encoded) or `{ "json": … }` (sent as JSON). There is no body with GET.
- An artifact with `request` is run without `url`. One without it is run with `url`, as today. The two are never mixed: prepare and run refuse both, and neither.
- A redirect is followed within `maxRedirects`. 301, 302 and 303 are fetched with GET and no body. 307 and 308 are sent again with the same method and body.

**Values.** A run's values are its inputs plus `start` (see 3). A value is a string or a number.

**Filling the template.** Substitution happens in one pass over the template, so a `{x}` inside a value is never filled again.
- In `url` and in each header value, `{name}` anywhere in the text is replaced by the value as text. In the url it is percent-encoded.
- In a body, only a string that is exactly `"{name}"` is replaced, and by the value itself with its type kept: `"first": "{n}"` with `n = 10` sends `"first": 10`. Every other string is sent as written. So a GraphQL query, full of braces, is never touched, and its variables go in `json.variables` as whole values.
- Prepare refuses a `{name}` that names no input and no `start` value, naming the place.
- Prepare refuses a header value with a line break, and so does run after filling.

### 3. More pages

The pages a run starts from are page 1 (the `url`, or the answer to `request`) and the pages that continue it. The first stage reads all of them. There are two ways to reach the next one, because a page either says where it is or doesn't. An artifact uses at most one: prepare refuses both.

**`next`: the link on the page.** A field rule over the whole page, allowed when the first stage is HTML:

```json
"next": { "selector": "a.morelink", "attribute": "href" }
```

It's needed where the next page's address can't be counted: Hacker News newest carries an item id (`?next=50507305`). The address is fetched with GET.

**`more`: the next request's values.** A Prism program on `request`:

```json
"request": {
  "method": "GET",
  "url": "https://dev.to/search/feed_content?per_page=15&page={page}&sort_by=hotness_score&sort_direction=desc&class_name=Article",
  "start": { "page": 0 },
  "more": { "$case": { "branches": [{ "when": { "$empty": { "$ref": "$.document.result" } }, "then": { "$const": null } }], "else": { "page": { "$add": [{ "$ref": "$.values.page" }, 1] } } } }
}
```

- `start` gives the values beside the inputs that `more` changes.
- `more` runs over `{ document, headers, values, url }`. `document` is the answer's JSON, or `null` when the answer isn't JSON. `headers` holds the answer's headers, each a list. `values` holds this request's values.
- It answers `null` to stop, or an object of `start` values with their new values. The same template is filled again and sent.
- A counter, an offset, and a cursor taken from a JSON answer are all this one program. The independent check ran this example through Prism: `{ page: 1 }` after a full page, `null` after `result: []`.
- A `more` that fails, or answers anything else (a list, a name not in `start`, a value that is neither a string nor a number), stops the run with a new error code, `MORE`, and the program's message.

**When paging stops.** It stops at the first of these:
- no next link;
- `more` answers `null`;
- the next request is one already sent this run (the same method, address and body): a last page that links to itself or back to page 1;
- a page gives nothing the first stage hasn't already read this run. For an HTML or XML records stage, that means no new record. For a JSON records stage, it means the same `document` as an earlier page. For a links stage, it means no address not already collected;
- the policy's `maxPages`.

The first four are the normal end, not a failure. The fifth sets `limited`, as link stages already do.

**Counting against `maxPages`.** Every page a run fetches counts, as today. When the first stage is a links stage (an index of releases over several pages), it pages on until it has `min(limit, room)` addresses, where `room` is `maxPages` minus the pages fetched so far, recomputed after each index page. Then the walk goes on to the next stage as today. So paging an index never takes the room its links need.

**What stays as it is.** Only the pages that continue page 1 are new. Everything about the other pages runs as today:
- Duplicates: the stage reader leaves out a record whose fields all equal an earlier one's on the same page (stage.ts). That rule also holds across the pages that continue page 1, and only there.
- `emptyPages` and `broken`: a continuing page that gives nothing ends the paging and is not counted. Every other page counts as today, so a detail page that gives no records still marks the artifact `broken`.

`inspect` reports each page with the values it was requested with (`{ page: 3 }`), or the link it was reached by, so an author sees where paging stopped and why.

### Requests, not addresses, inside the walk

- **Read once.** Today the walk reads an address once (walk.ts:124-129) and keeps `visited` as addresses. Two POSTs to one address with different bodies are different pages, so both now key on the whole request: method, address and body.
- **Offline runs.** These take `pages: (url) => …` today (walk.ts:96, used by benchmarks/rerun.ts and discovery's replay). That becomes `pages: (request) => …`. A GET request is `{ method: 'GET', url }`, so the callers change one line each.
- **The transport.** It gets one general `send(request, signal)` that adds the profile's headers. `get` and `post` stay as they are, and search keeps using `post`.

### Grammar version

These additions are `nisc.haptic` 1. The upgrade from 0 only changes the stamp, and every v0 artifact means the same thing under v1.

## Traces by hand

**Hacker News, 90 stories.** `run({ url: "https://news.ycombinator.com/" })`. The first stage reads records `tr.athing` with title and link fields. Request values aren't needed, so `next` is `a.morelink`. A counter would also work, with a request on `?p={p}`. Policy `maxPages: 3`.

1. Page 1 gives 30 records and `?p=2`.
2. Page 2 gives 30 and `?p=3`.
3. Page 3 gives 30, and its next link would be page 4, but `maxPages` is reached.

90 records, `limited: true`.

**Hacker News newest.** The same, from `https://news.ycombinator.com/newest`. `next` reads `newest?next=50507305&n=31`, an id no counter can make.

**dev.to, 75 articles.** The `request` above, the JSON records stage, policy `maxPages: 5`. The mapping takes `document.result` from every record and makes an address from each `path`.

1. Pages 0 to 4 give 15 each (measured: 75 distinct).
2. `more` would ask for page 5, but `maxPages` stops the run.

`limited: true`. Without the cap, the run would stop at the first empty `result`. Page 200 is already one.

**npm search, every result.** Inputs `text`. Request url `https://registry.npmjs.org/-/v1/search?text={text}&size=20&from={from}`, start `{ from: 0 }`. `more`: `null` when `values.from + 20 >= document.total`, else `{ from: values.from + 20 }`. For "haptic", total 481, so 25 requests, which needs `maxPages` of at least 25. The last request (`from=480`) gives 1. The independent check ran this program: `{ from: 480 }`, then `null`.

**DuckDuckGo search.** Inputs `query`. The POST request above, and a records stage `.result` with title, link and snippet fields. One request, 10 results.

**countries GraphQL.** POST `https://countries.trevorblades.com/`, body `{ "json": { "query": "query{countries{code name}}" } }`. No `{name}` string stands alone, so nothing is filled. 250 countries.

**GitHub API releases.** Inputs `owner`, `repo`. Url `https://api.github.com/repos/{owner}/{repo}/releases?per_page=30&page={page}`, start `{ page: 1 }`. `more` answers `null` on an empty array.

## Who writes these

At first, authors: a person or a model with ARTIFACTS.md and `inspect`. Option 2 showed that path works for the existing grammar (four sites complete on both copies). ARTIFACTS.md gets a section with the traces above as tested examples.

Discovery doesn't write them in this design. Two follow-ups for later, each its own design:
- discovery spotting a next link or a page counter;
- a caller (Mira's `read_web`) passing inputs.

## How we know it works

1. **Nothing old changes.** The 2,486 saved artifacts in `data/bench` (gitignored, in this worktree) each run before and after on their captured pages. The two runs must agree on the data, the record counts, `emptyPages`, `broken`, `limited` and `visited`.
2. **Offline tests on recorded answers:**
   - each stop condition: no link, `null`, a request already sent, nothing new on HTML and on JSON, `maxPages`;
   - an index links stage that pages, against `limit` and `maxPages`;
   - duplicates across continuing pages, and none dropped across detail pages;
   - a continuing page that gives nothing does not mark the artifact broken, and a detail page still does;
   - two POSTs to one address with different bodies, both read;
   - form and JSON bodies; a number kept as a number; a GraphQL query left untouched; a value containing `{x}` sent as written;
   - percent-encoding in the url; an artifact header over a profile header;
   - redirects after POST: 303 becomes GET, 307 sends the body again;
   - `more` failing on a page that isn't JSON (`MORE`), and answering an unknown name;
   - refusals: a missing input, an unknown input, an unfilled `{name}`, `next` and `more` together, `next` on a stage that isn't HTML, `request` and `url` together, a header with a line break.
3. **Blind, live.**
   - A fresh agent that has seen none of this picks 8 public pages whose wanted list needs one of these interactions, none of them the ten in the table above. It gives each one instruction.
   - A second fresh agent writes the reference answers by hand.
   - A third, with only ARTIFACTS.md and `inspect`, writes the artifacts.
   - Each artifact is graded with `benchmarks/grade.ts` against references taken the same day, and again a day or more later.
   - It has done its job if 6 of the 8 are complete on both days.

## Size

About 380 lines of code plus about 200 of tests:
- grammar 60;
- templates and the request 80;
- the transport's `send` 25;
- paging in the walk 130;
- the walk keyed by request, and its callers, 25;
- prepare's checks 40;
- inspect's values 20.

ARTIFACTS.md grows by about 100 lines.

## Left out, on purpose

- **Cookies and a session per run:** no measured page needs them.
- **Paging any stage but the first:** no measured page needs it, and the first stage covers paged lists and paged indexes.
- **Reading the next address from a JSON answer or a `Link` header as a raw address:** every measured JSON source pages by a value. Headers are lists, and `more` answers values, not addresses.
- **One list from several stages of different formats** (an HTML first page, then JSON pages): an artifact can choose the JSON request from the start.
- **Fields carried from a list page into the pages its links lead to:** a separate change, not an interaction.
- **Anything a page's scripts compute or sign, WebSockets and sign-ins:** these need a browser.
