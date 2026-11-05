# News discovery recovery — 2026-11-03

## Verdict

The approved HTML evidence and whole-rule repair corrections are implemented and verified. They **do not restore the previous news discovery quality**. Fresh Guardian discovery returns eight supported headlines and two descriptions, but every generated article URL is wrong and returns HTTP 404. Fresh Spiegel discovery returns five supported headline/link pairs, four additional linked descriptions without headlines, and one empty record. Earlier unmodified artifacts still produce ten supported headline/link pairs on these identical newly captured pages.

No wider model batch, manual artifact correction, saved-page substitution or production change between the two discoveries occurred. The engine, readers, common model adapter, published Prism runner and dependencies remain unchanged.

## Implemented ownership

- The shared profile now scans the admitted document's matching-element range rather than the first 32 tags: initial selector `*`, offset 0, limit 20,000, `omitNested:true`. Existing decoded-input, display-byte, combined-request and interpreter/model limits stay unchanged. This is a JSON-owned display policy, not a relevance classifier or extraction cap.
- The existing generic `html.view` operation includes fitting whole subtrees and skips descendants already present inside an included parent. It reports covered matches, omissions and continuation. It does not inspect page semantics or acquire URLs.
- The old pairwise ancestor filter in JSON is deleted. Rendering joins the bounded fragments directly. Fieldless scoped inspections also suppress covered descendants; explicitly field-bearing inspections retain every displayed match's field associations.
- One strict full-rule `author.html` operation replaces the separate initial/selection/navigation/processing HTML operations and narrow candidate schemas. JSON still owns admission, trials and retry decisions. A failed navigation proposal can now be replaced with extraction, without resetting the allowance or expanding caller permissions. XML and Prism job ownership are unchanged.
- `InitialHtmlViewSchema` derives from the owning view-input schema and is shared by profile admission and blueprint composition.

## Offline and engineering evidence

Exact source-author and reviewer inputs were generated through the actual JSON helpers on both saved failed captures, with HTTP/models forbidden. Each source-author view exposes all ten earlier independently verified headlines and their links; each reviewer view exposes all ten headlines. Source-author request sizes are 264,515 and 264,631 bytes; source HTML messages are 253,984 and 252,006 bytes. The previous first views were head-only, 9,916 and 9,111 bytes.

Controls cover a small valid head with more than 32 tags before body records, hundreds of small sibling subtrees, whole-rule replacement after forbidden navigation, preserved parent/child field observations, explicit omissions, cancellation and continuation byte limits.

Four independent engineering roles reviewed the scoped correction. They found two material implementation defects before paid tests: the old pairwise JSON filter exhausted the interpreter allowance at 500 siblings, and continuation metadata could exceed a display bound by one byte. The filter was removed; accounting now reserves both numeric and null continuation widths. Focused follow-up checks pass. A nested-field observation caveat was also resolved by retaining field-bearing matches. Final scoped engineering grades are 9/10; they do not certify discovery accuracy.

`pnpm typecheck` and the complete `pnpm check` pass, including all 43 TypeScript test files and 15 benchmark-support tests. The HTTP-only PDF regression downloads the correct 116,547-byte RFC PDF without models. One remaining benchmark assertion from the preceding audit expected the retired empty-reference exception; it now checks that a stale price fails independent final-data grading when the reference is absent. Genuine empty data controls remain.

## Fresh results

Both unchanged request + URL inputs use automatic result schemas and the same frozen default 120b/high/temperature 1/top-p 1/emit configuration. Each generated artifact is independently prepared and executed against fresh HTTP, with model requests prohibited during execution.

| Case     | Supported headlines | Source-supported article URLs | Complete headline/link pairs | Supported descriptions | Empty records |
| -------- | ------------------: | ----------------------------: | ---------------------------: | ---------------------: | ------------: |
| Guardian |                   8 |                             0 |                            0 |                      2 |             2 |
| Spiegel  |                   5 |                             9 |                            5 |                      4 |             1 |

Guardian descriptions belong to two of its returned headlines. Spiegel's four descriptions have their own correct links but no headline; none of its five complete headline/link records has a description. Both model reviewers accepted these incomplete results. No completeness pass is claimed.

| Case     | Provider requests | Reported input tokens | Reported output tokens | Total case time | Fresh artifact execution | Preparation |
| -------- | ----------------: | --------------------: | ---------------------: | --------------: | -----------------------: | ----------: |
| Guardian |                 8 |               326,933 |                 22,734 |        71.865 s |               234.970 ms |   98.685 ms |
| Spiegel  |                11 |               470,694 |                 35,595 |       114.228 s |               215.382 ms |   66.141 ms |
| Combined |                19 |               797,627 |                 58,329 |       186.093 s |                        — |           — |

All 19 provider requests report usage. Actual rate-limit waits: zero. Execution AI requests: zero. Execution times include HTTP; preparation is shown separately. Eight additional HTTP-only Guardian URL checks all return 404; these checks do not correct the output and are not included in the two discovery-case timing totals.

The preceding failed batch used 26 requests, 400,908 input / 78,306 output tokens and 213.791 seconds. The new run uses fewer requests/time and roughly doubles input while returning some real data. Those resource changes do not mean the original target was recovered: neither new discovery returns ten correct headline/link pairs.

## Exact remaining failure chain

### Guardian

1. Source author inspects actual article records, then proposes extraction plus disallowed navigation.
2. JSON rejects that navigation. The same full-rule author removes navigation and retains extraction. This is the live proof that the narrow repair trap is removed.
3. Its broad record selector includes two non-article rows among the first ten; they become all-null output rows.
4. The actual published Prism agent's first response intends to derive an origin from `sourceUrl`, but its JSON is malformed. Cortex recovers the syntax in the next request. That valid replacement instead concatenates `baseUrl` and the root-relative article path.
5. The base is `https://www.theguardian.com/europe`; an actual source href is `/culture/...`. Concatenation produces `/europe/culture/...`, rather than resolving it to `/culture/...`. All eight produced links return HTTP 404.
6. The reviewer incorrectly says every row has a headline and link, missing both the bad URLs and two blank rows. It accepts, so no semantic repeat occurs.

This is not an engine or transport failure. JSON recovery succeeded syntactically; it did not establish correct URL semantics.

### Spiegel

1. The source author inspects actual articles and lists results in its prose response, but its artifact candidate is `{selector:null,links:null,result:null}`.
2. That no-op proposal passes current mechanical admission. The following schema/mapping jobs therefore see `records:[]`. The first mapping guesses top-level record properties and supplies nulls; it has no extracted record instance to work from.
3. The reviewer requests a navigation inspection, receives no article fields, and rejects the result. Its feedback misdiagnoses the available evidence, but the bounded full-pipeline correction does run.
4. The source author now proposes a real full extraction rule. The replacement Prism program correctly reads `record.fields`.
5. The learned headline selector covers only some teaser layouts. Five headlines and nine URLs survive; four other records have descriptions and URLs but no headline, and one record is empty.
6. The final reviewer again accepts nullable entries as satisfying the whole request. The artifact is returned as usable partial data, not suppressed.

## Independent comparison and grading boundaries

The two earlier unmodified artifacts were executed offline on the exact HTTP responses captured during these new fresh executions. Each still returns ten source-supported headline/link pairs. No model or additional HTTP call participates in that comparison. This keeps the remaining problem located in fresh artifact authoring, not the reader or website availability.

The supplemental Guardian headline-only check initially limited headings to `main`/`article`. Some genuine feature cards live outside those containers; the check was corrected to examine all heading elements, preserving its original scope/count in the detailed record. The strict current headline/link score stays zero. No model output or artifact was changed.

## Recommended next boundary

Do not change model settings or keep tweaking prompts from these two outcomes. Resolve two concrete ownership gaps first:

1. **A no-op proposal is not a learned extraction rule.** Specify how current JSON admission distinguishes no source rule from a valid learned selector that later produces empty data. Feed that mechanical distinction back to the same source author before schema/Prism work. Keep legitimate navigation-only rules, usable partial artifacts and caller limits intact. This is not a requirement to find ten records or make every field mandatory.
2. **URL resolution should be mechanical.** The engine already has `url.resolve`; a mapping model should not invent HTTP reference semantics by concatenating strings. Specify a generic, dynamic-field handoff supplying resolved URL references to Prism while preserving original values/provenance. No Guardian-specific rewrite or local replacement Prism agent.

The remaining imperfect selector/reviewer choices are visible model limitations. Returning partial data remains the approved behavior. These recommendations are not implemented by this slice and require a concrete contract before another paid proof.

## Evidence locations

`data/runs/news-recovery-2026-11-03/` contains frozen source/build, unchanged request/profile inputs, exact provider bodies, all HTTP captures, raw decisions (including malformed output), returned artifacts, independent fresh executions, source/partial association checks, eight Guardian 404 checks, older-artifact comparisons, context verification, ownership hashes and offline logs. Source evidence and all earlier failures remain intact.
