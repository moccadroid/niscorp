# Connected image-choice search — 2026-10-30 (Europe/Vienna)

## Actual input and result

Unchanged request: `Show me a list of ai meetups in Vienna!`.

The final run acquired a fresh DuckDuckGo HTTP 202 image challenge, downloaded all nine current image URLs, called Jev once, submitted its selected original checkbox values and received the server's success form. It submitted that form, followed its 302 and obtained HTTP 200 with ten actual search results and no challenge. Jev evaluated these ten results in one separate relevance request. Five selected destinations then entered normal discovery. No saved page, model response, supplied destination URL, selector answer or manual model/selector correction entered this run.

The live search-to-extraction connection ran end to end. The returned answer is partial and contains unwanted entries; execution success is not a semantic accuracy score.

| Destination | Returned outcome |
| --- | --- |
| AIEventlist English Vienna page | Reviewed artifact; three event-title links |
| AI What's On Vienna page | No artifact: Groq emitted an `output_parse_failed` stream error during semantic review |
| AllEvents Vienna AI page | No artifact: author attempts requested unavailable onward navigation, with an invalid-precondition attempt between them; Cortex exhausted its configured three output attempts |
| Meetup Vienna AI group | Reviewed artifact; eight native entries covering four event URLs, including two blank anchors and two registration-text fragments |
| AI Tinkerers Vienna | HTTP 403, no artifact |

Seven identifiable event titles appeared among eleven returned native entries:

- Agentic AI: Wenn KI nicht nur antwortet, sondern handelt
- Agentic AI in der Praxis — Meetup Wien (Oktober 2026)
- AI Tinkerers Vienna — Builder Meetup Oktober 2026
- AI Summit (Virtual) - Run AI and Data Pipelines — Nov 4, 4:00 PM CET, online
- Google AI Deep Dive (Ep 5) - Discriminative (Jev/DiffusionGemma) models — Nov 11, 6:00 PM CET, online
- AI Deep Dive with Google (Ep 4) - Agents Security — Oct 14, 7:00 PM CEST, online
- [Virtual] Google Agents in Production for Enterprises - EP 4 — Oct 12, 6:00 PM CEST, online

The three AIEventlist records did not extract separate dates. Do not insert dates from another source or present the list as seven current physical Vienna meetups. The four extra blank/registration entries remain in the unmodified result. The semantic reviewer accepted the overbroad Meetup selector; that is a remaining false acceptance, not repaired by this integration. No deduplication or presentation cleanup was added to the library.

## Numbers

| Measurement | Final run |
| --- | ---: |
| CAPTCHA recovery, including images/preparation/continuation | 2.123 s |
| CAPTCHA Jev | 1 call; 3,873 input / 157 output tokens; 483 ms |
| Relevance Jev | 1 call; 1,751 input / 164 output tokens; 190 ms |
| Groq 120b | 14 requests; usage reported for 13 |
| Reported 120b tokens | 287,469 input / 24,042 output |
| Total reported tokens | 293,093 input / 24,363 output, **incomplete** |
| Entire run, including fresh artifact re-execution | 224.809 s |
| Benchmark quota waits | 145.271 s |
| Summed model request time | 69.217 s |
| Separate fresh mechanical artifact executions | 2/2; 379 ms combined including HTTP; zero model calls |

Request 8 returned HTTP 200 but ended with a provider stream error and no usage. The reported token counts exclude that unavailable usage; no zero is invented. Both returned artifacts were freshly executed with normal web operations and model calls blocked. This demonstrates present-page execution only.

## Earlier attempts remain failures

1. `search-connected-2026-10-29T23-18-00-662Z`: fresh challenge/images acquired, then the Windows PowerShell 5 launcher refused the local preparation script. Zero model calls. The host now uses installed PowerShell 7. A separate local codec preflight verified all nine prepared images without model calls; its saved input was not used in the live run.
2. `search-connected-2026-10-29T23-19-13-329Z`: fresh challenge solved by Jev and accepted by the server, but the redirected GET returned another HTTP 202 challenge. One Jev call, 3,867 input / 157 output tokens, 1.854 s total. No query results or artifact were returned. The host used fetch for forms and native HTTP for GETs. Form POST was changed to the same native HTTP client family, eliminating the implicit header/client difference. The subsequent successful run is not controlled proof that this difference was the sole cause of the earlier challenge.
3. `search-connected-2026-10-29T23-20-38-701Z`: final fresh run described above. All relevant bytes/model decisions were newly acquired even where the server returned the same tile images again.

Across the two paid attempts: 17 model requests, with reported usage of 296,960 input / 24,520 output tokens plus the one unavailable Groq usage record. Neither failed attempt was relabelled or removed. The older HTTP 200 no-results observations remain unexplained; fresh CAPTCHA recovery does not establish their cause.

## Implementation and verification

The optional `eden-next/search/image-choice` entry prepares the JSON recovery workflow once and supplies it through existing `recoverSearch`. Original tested parsing, vision request, Prism selection and form construction were promoted to TypeScript; research imports the same implementation. The host owns codec, vision wire, POST effects and evidence. No engine or dependency-lock changes were made. No browser, database, session framework, extra crawler or execution AI was added. Saved-page mode was removed from the live runner.

Four independent roles reviewed Nisc alignment, generic grammar, correctness and code quality. Modest findings were fixed: empty selected subsets, duplicate research implementation, charset decoding, owned POST identity, meaningful reader errors and removal of a duplicate positive-result gate. No whole-crew repeat was required.

Typecheck, the full existing offline checks, five new recovery groups and eight existing image-choice checks pass. The unchanged live PDF check passed at `data/runs/live-pdf-2026-10-29T23-17-48-132Z`, with the original 116,547 bytes and `f09ffbee2a526425f2ee43a7cef12577dcaf9258a5a7f317081279baacd43058` hash. Full result/effect evidence remains under the owning run directories.
