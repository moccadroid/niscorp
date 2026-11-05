# HTML evidence live follow-up — 3 November 2026

**Both fresh live tests fail the requested task.** Guardian returns only homepage metadata; Spiegel returns an empty array. Both mechanically working artifacts execute without AI. That is not useful task success and does not establish discovery readiness.

## Frozen test

One fresh discovery per original request, sequentially, with current default discovery/native profiles, Groq `openai/gpt-oss-120b`, high reasoning, temperature 1, top-p 1 and emit:

- `https://www.theguardian.com` — “get me the headlines, abstract/description, and article links for the top 10 articles from theguardian.com”
- `https://www.spiegel.de` — “get me the headlines, abstract/description, and article links for the top 10 articles from spiegel.de”

Every acquisition is live HTTP. No saved sources/answers, manual artifact corrections, expected selectors or site-specific settings enter discovery. Every published artifact is independently executed with fresh live HTTP and the mechanical operation registry only. Source/code/settings hashes are unchanged across both runs. No production patch or additional paid retry followed.

Evidence is under `data/runs/live-news-evidence-2026-11-03/`: frozen code, exact inputs/profiles, raw provider requests/responses, HTTP captures, full discovery result, generated artifacts/schemas, independent execution and final qualification.

## Results and cost

| Case | Requested articles returned | Actual data | Requests | Input tokens | Output tokens | Measured run seconds |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Guardian | 0 | One homepage title/description/link | 15 | 81,781 | 49,148 | 123.114 |
| Spiegel | 0 | Empty array | 11 | 319,127 | 29,158 | 90.677 |
| Total | 0 | Neither request fulfilled | 26 | 400,908 | 78,306 | 213.791 |

Usage is reported on all 26 provider requests. Zero actual quota waits. Measured case time includes discovery and independent artifact execution; the combined figure excludes investigation/setup gaps between the two cases.

Independent AI-free execution takes Guardian 196.367 ms plus 57.111 ms preparation; Spiegel 88.436 ms plus 66.206 ms preparation. Execution model calls are zero. Both final reviews reject the results. Both configured repair passes are attempted.

Guardian's exact final data is:

```json
[
  {
    "headline": "Latest news, sport and opinion from the Guardian",
    "abstract": "Latest news, sport, business, comment, analysis and reviews from the Guardian, the world's leading liberal voice",
    "link": "https://www.theguardian.com"
  }
]
```

Spiegel's exact final data is `[]`.

## Guardian: actual failure

The initial broad `*` window covers the first 32 matching elements. They are in the document head. The view correctly says `completeDocument:false` and `nextOffset:32`; it contains no body. The acquired live page does contain articles: the independently fetched execution capture has 30 article-overlay anchors and 196 main headings.

The author asks for obsolete `li.fc-item` selectors, gets no matches, then proposes them anyway. After mechanical rejection, it selects `head` and maps the page title, description meta tag and canonical URL into article fields. That mechanically passes but does not answer the request.

The reviewer rejects the result without using its inspection option. The bounded author repair again guesses old classes and falls back to `head`; final review rejects again. There is no claim of article success.

This falsifies the stronger inference from the offline test: supplying some real HTML is insufficient when the initial view exposes only the head and the model treats the unshown body as unavailable.

## Spiegel: actual failure

The initial view also contains only the head. The author initially proposes following an RSS link despite disabled link following, with `selector:null`. Local repair narrows the job to navigation. The next inspection does expose real article content; the model's following response even lists ten headlines/links in prose. But its permitted candidate only repairs navigation with `links:null`, retaining the absent extraction selector. The mechanical extraction and mapping therefore produce an empty array.

Review rejects it, again without requesting inspection. The bounded repair starts over. The source author asks for a 200-match article window at offset 32 and receives a large body view. Its next three responses use the invalid outer envelope key `reason` instead of `reasoning`. Cortex supplies the exact unknown-key correction twice; the model repeats the error and reaches the configured three-step per-invocation limit. The preceding working-but-empty artifact is retained, as required by publication policy.

Those last three failed responses consume **276,152 input tokens** (91,901 + 92,050 + 92,201), most of Spiegel's total. The published Prism agent does not fail here; it receives no selected article records in the first pass and maps the empty input.

## Assessment

The offline checks correctly establish operation, scope, budget and publication mechanics. The live test shows that the current evidence strategy and recovery path still fail these tasks. The four engineering review grades are not practical success evidence.

The concrete gaps are initial views dominated by head content, semantic reviewers declining instead of inspecting missing body evidence, and component repair able to settle on a rule that extracts nothing. Another prompt change or raised limit has not been applied. The current HTML discovery flow must not be presented as practically validated for these requests.
