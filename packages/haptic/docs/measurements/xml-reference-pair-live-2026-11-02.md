# Paired XML reference author: focused live result

One fresh 120b discovery returned an unedited artifact, downloaded the correct PDF exactly once and passed the unchanged file/output grading. Independent fresh execution of that artifact passed the same checks without AI. There is a separate instruction-scope caveat: the generated XML rule also selects a PDF resource directly from the feed, although the request says to use article pages to find downloads. The frozen checks do not establish exclusive article-only download provenance.

## Frozen scope

The instruction, URL, caller schema including `uniqueItems: true`, grading, run driver, phase classifier and provider audit are byte-identical to the preceding failed run under `data/runs/live-pdf-feedback-resources-2026-11-02`. Model remains `openai/gpt-oss-120b`, high reasoning, temperature 1, top-p 1, emit. Model transport, default profile, allowances, lockfile, all 11 engine files and mechanical runtime helpers remain unchanged.

Current source/build and workflow were copied and frozen before running. All acquisition was live: no saved-page substitution, supplied answer or manual artifact correction. Raw provider bodies were preserved before parsing. Frozen files and workspace source/build remained unchanged throughout. There was one discovery and one independent AI-free artifact execution; no additional paid attempt followed.

## Actual result

```json
["https://arxiv.org/pdf/1706.03762v7"]
```

Both the final fresh discovery trial and independent execution visited the live feed and `https://arxiv.org/abs/1706.03762v7`, then downloaded one PDF. The captured source trial, complete fresh trial and independent execution each fetched that final PDF once. Final visited list contains two documents and `limited` is false. Download: **2,215,244 bytes**, `%PDF-1.5`, SHA-256 `bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697`.

## What the model authored

The paired XML author succeeded on its first call. It selected both `articleUrl` and `pdfUrl` using XPath against the original Atom XML. Its Prism mapping reads `$.input.items`, emits article URLs as `links` and PDF URLs as `resources`. The missing-article-field/malformed-reference loop from the preceding run did not occur. No source inspection, failed-candidate repair or Cortex schema recovery was needed in this run.

The HTML author selected `a.abs-button.download-pdf`, with no preconditions, no onward links, and the existing resource flow reading `attributes.href`. The complete artifact uses these rules to visit current article URLs and read their current PDF links.

The output program reads `$.input.resourceUrls` first through `$coalesce`. It also authored an unnecessary fallback program reconstructing URLs with a fixed host. That fallback is not used in these executions: the shared projection supplies an array even when empty. The generated program was preserved exactly, without manual simplification.

The final reviewer accepted because the returned PDF URL matches the article-page download link for the one paper in the feed. This is a data verdict, not a review of every artifact branch.

## Measurements

| Measure                   |     Before paired XML |                                 Paired XML |
| ------------------------- | --------------------: | -----------------------------------------: |
| Artifact                  |                  None |                                   Returned |
| Frozen file/output checks |           Not reached |    Passed in discovery and fresh execution |
| Provider requests         |                     5 |                                          5 |
| Reported input tokens     |                27,087 |                                     45,126 |
| Reported output tokens    |                34,325 |                                     18,263 |
| Discovery                 |              84.632 s |                                   45.773 s |
| Total experiment          |              84.954 s |                                   46.421 s |
| Independent execution     |           Not reached | 131.044 ms, including 3 live HTTP requests |
| Independent preparation   |           Not reached |                                  67.709 ms |
| Rate-limit waits          |                     0 |                                          0 |
| Execution model calls     | Execution not reached |                                          0 |

Every provider response was HTTP 200 and reported usage. The new run reaches HTML, output authoring and final review, whereas the previous run stopped during reference authoring. The input-token totals are not an isolated comparison of the two reference contracts. This is one stochastic successful run against one previous failure, not an accuracy estimate or proof that the architecture is generally faster.

| Phase                | Requests | Input tokens | Output tokens | Provider interval |
| -------------------- | -------: | -----------: | ------------: | ----------------: |
| Task                 |        1 |          671 |         1,621 |           3.707 s |
| Paired XML reference |        1 |       11,740 |         5,455 |          12.099 s |
| HTML source          |        1 |       12,562 |         1,832 |           4.398 s |
| Output mapping       |        1 |        7,735 |         8,377 |          17.854 s |
| Final data review    |        1 |       12,418 |           978 |           2.828 s |
| Total                |        5 |       45,126 |        18,263 |          40.885 s |

Total HTTP requests: nine. Learning/captured acquisition made three, the final fresh discovery trial made three, and independent execution made three. There were no redirects or quota waits. Remaining wall time includes preparation, transport outside provider intervals, local execution/validation and evidence recording; it was not isolated as engine overhead.

## Remaining caveats

The original request says to use article pages to find downloads. The artifact visits and selects those pages, but its XML rule also declares the feed's PDF links as downloadable resources. Both routes point to the same file here and existing acquisition deduplicates it. The unchanged grading verifies requested visits, exact files and unique returned data; it does not reject this additional route. Exclusive article-sourced downloads and behavior if the feed PDF reference disappears or differs remain unproven. No new grading rule, prompt fix or artifact edit was applied after observing this.

Failure-feedback retention was not exercised because no source candidate failed. The acquired-resource projection was exercised and supplied the unique output. The output fallback remains unnecessary generated complexity. No changed-source or cross-page reuse test was run in this focused experiment. Earlier failed discoveries retain their original outcomes.

## Evidence

`data/runs/live-pdf-xml-pair-2026-11-02/` contains exact input/grading/scope, frozen source/build, all provider requests and raw responses, HTTP captures, discovery and execution outcomes/grades, the returned `artifact.json`, `generated-decisions.json`, `analysis.json`, `closure.json` and `summary.json`. `download-1.pdf` is the independently executed response body, saved afterward solely as ignored host-side evidence.
