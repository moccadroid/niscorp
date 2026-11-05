# Live DuckDuckGo HTTP investigation — 2026-10-29

Status: **live search is blocked intermittently; reliable retrieval is not established.** No destination discovery was continued.

## Scope and evidence

Instruction/query: `Show me a list of ai meetups in Vienna!`.

All 27 requests below went to live DuckDuckGo endpoints. No saved response was substituted. No model credentials were loaded, no model API calls were made, and no CAPTCHA answers were submitted. Research scripts, configuration, exact request inputs, response headers, unmodified response bodies and outcomes are retained under `data/runs/duckduckgo-http-investigation-2026-10-29`. Three local DNS failures before network permission are recorded separately in `local-network-preflight.json`; no HTTP response was received for those, and they are excluded from the 27 live requests.

The first three groups exercised the existing `http.get` and `html.select` operations. The comparison additionally used native Node fetch, ordinary browser headers, an identifying Haptic header, the HTML form's POST method and the main-host redirect. The final group prepared the actual existing search-page/search-result/fetch/redirect JSON flows with the public search operation factory. It made no changes to these flows, used no recovery replacement and forbade all fetch/model calls. Each actual native HTTP acquisition was recorded before engine interpretation.

## Results

| Test | Requests | Result pages | CAPTCHA pages | Redirects |
| --- | ---: | ---: | ---: | ---: |
| Default Haptic requests, 5-second gaps; original query repeated plus short-query and SQLite controls | 6 | 1 | 5 | 0 |
| Request variations, 10-second gaps | 6 | 4 | 1 | 1 |
| Default, identifying and browser headers interleaved four times, 5-second gaps | 12 | 1 | 11 | 0 |
| Actual search-page JSON flow: 65-second initial pause and 65 seconds between requests | 3 | 0 | 3 | 0 |
| **Total** | **27** | **6** | **20** | **1** |

Each result page contained ten result cards. Haptic's native selector agreed with the independently inspected HTML on all native-operation acquisitions. Observed titles included Vienna AI Engineering, Vienna AI and Vienna AI event directories. These counts demonstrate that ordinary HTTP can retrieve useful results sometimes; they do not demonstrate reliable search.

Every CAPTCHA response was HTTP 202 and explicitly asked to confirm a human search and select squares containing a duck. Both the shorter query and unrelated SQLite control were challenged. All four identifying-header requests and all four browser-header requests in the repeated comparison were challenged. A single successful browser-header, fetch or form-POST request in the earlier comparison is not evidence that its variation solves blocking. No such speculative fix was added to production.

The main-host request returned HTTP 302 to the same `html.duckduckgo.com/html/` URL; it was not followed in this route comparison and is not counted as a successful result page.

The three paused actual-flow runs all returned `SEARCH_ACQUISITION_BLOCKED`, with zero model calls. Waiting 65 seconds did not restore retrieval in that test. The provider did not disclose its bot-classification algorithm, blocking scope or a reliable retry-after interval; none is inferred from these observations.

## Earlier HTTP 200 empty responses are a separate unresolved observation

The original successful response contained ten results. Eight minutes later, the same URL returned HTTP 200 with an explicit `No results found` heading, and the alternate query did too. Comparing the saved sources found no changed query, extra search filters, response cookie requirement or visible CAPTCHA marker that explains that difference. This is inspection of historical evidence, not a saved-source input to any new live test.

The new 27-request investigation did not reproduce that HTTP 200 empty layout. Its cause therefore remains unproven. It must not be relabelled as a confirmed CAPTCHA, rate limit, parser failure or genuine absence of meetups. The current workflow recognizes a provider-reported no-results marker and may return `insufficient:true`; the marker alone cannot prove an authoritative empty search.

## Concrete integration gap and boundary

`createSearchOperations` exposes `recoverSearch`, but the connected driver supplies no adapter. The default recovery operation throws `SEARCH_ACQUISITION_BLOCKED`. The isolated Jev image-choice research is not a library recovery adapter and is not installed automatically. That missing connection explains why an explicit CAPTCHA currently terminates acquisition; it does not explain the older HTTP 200 no-results bodies.

No source, engine, model policy, request-header profile, retry mechanism or dependency was changed during this investigation. The research scripts passed Node syntax checks. No paid test or destination extraction followed. The next capability work, if continued, is connecting and qualifying recovery through the existing hook, not claiming that waiting or headers fixed retrieval. A model-assisted recovery test would be a separate paid test and was not run under this instruction.
