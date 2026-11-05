# Search discovery

The `@niscorp/haptic/search` entry composes first-page DuckDuckGo HTML acquisition, model source ordering and the same fixed destination-discovery pipeline. It returns per-source artifacts/results and failures, not a synthesized answer. Ordinary execution does not load model or image dependencies.

```ts
import { prepareArtifact } from '@niscorp/haptic';
import { createSearchOperations, searchWorkflow } from '@niscorp/haptic/search';

const search = createSearchOperations({ author: { apiKey } });
try {
  const prepared = await prepareArtifact(searchWorkflow, search.operations, search.limits);
  const result = await prepared.run({ instruction: 'Find the requested sources.' });
} finally {
  search.close();
}
```

## Request and policy

```text
{instruction,asOf?,query?,maxFollowResults?,minSuccessfulSources?,maxQueryRewrites?,page?}
```

Without query, the unchanged instruction is the initial query. Every chosen destination receives that same instruction and optional caller time. No person supplies an intermediate extraction request.

Page options are `{allowLinkFollowing?,linkDepth?,maxPages?,allowResourceFetching?,maxResources?,outputSchema?}`. They apply separately to each destination. Search's follow allowance is shared across query attempts. Search acquisition, result links and CAPTCHA continuation consume none of a destination's page/depth allowance. Each found page starts at depth zero.

The JSON search profile defaults to one DuckDuckGo result page, top five attempted destinations, a desired minimum of two usable sources, one alternative query and 120b ordering. Destination defaults allow one link level; caller page fields override them individually, preserving false/zero. Direct-URL discovery keeps its separate disabled-following default.

`search.json` owns sequencing, normalization, checks and bounded rewriting. Its profile owns endpoint/selectors/field mappings/wrapper identity, prompts/models and limits. Native code supplies typed protocol and URL mechanics, not another crawler/planner. Ranking/rewrite/page authoring use the configured discovery provider/credential. Jev is used only by an explicitly injected image-choice adapter.

## Ordering and traversal

JSON deduplicates normalized URLs and previous targets, then offers all remaining candidate titles/descriptions/URLs to one ordering call. It supplies the instruction, query, optional time, remaining slots, per-destination allowances and compact prior observations. Destination HTML and grading labels are absent.

The ranker emits `{rankedIds}` in visit order. JSON checks membership, uniqueness and remaining count before destination work. It does not sort confidence scores or append omitted candidates as fallback. Only the configured wrapper origin/path is decoded; no language/semantic canonicalization is inferred.

Each attempted source spends one follow slot even when discovery fails. Source discovery uses its fixed task → source/trial → schema → bare Prism/trial → verdict → fresh-trial pipeline. Discovery without a working artifact stays unresolved; search may continue to the next selected source. A negative semantic verdict alone does not suppress a working artifact. Search does not invoke an extra judge or bypass page permissions.

`minSuccessfulSources` is a sufficiency indicator, not an early stop. Search exhausts the retained queue or follow allowance. A usable source requires a published `ready` artifact, completed final trial and applicable output. The semantic verdict stays visible in destination feedback; a negative verdict does not suppress a mechanically working result. The minimum counts mechanically usable sources, not semantic acceptance. Caller-schema-permitted empty/scalar values retain their meaning. A minimum above the follow cap fails before acquisition; zero still visits sources but does not request a rewrite.

Only after the retained queue is exhausted, with too few usable sources and remaining follow/rewrite allowance, can JSON request a different query. The rewrite receives compact reason/review/trial/stage/partial-trial diagnostics, not source bodies or artifact programs. Failure of an attempted extractor is not proof that its source lacks information. Repeated targets/queries cannot buy unbounded retries. Valid null rewrite ends this exhausted queue; malformed/provider failure remains distinct.

Rewrite policy preserves the original constraints and does not invent an unspecified year or additional restrictions. This is model-facing JSON policy, not a semantic-equivalence proof. No pagination is followed.

## Results and reuse

The result is `{instruction,attempts,selected,successfulSources,insufficient,destinations,continuationError}`. Attempts retain normalized candidates/ordered IDs. Selected includes failed visits. Destinations retain ordinary outcomes plus artifact, trial, execution, usable and compact feedback. Completed search does not mean every source succeeded; partial source results remain visible.

`continuationError` is normally null. If an optional rewrite or subsequent search acquisition/ranking fails after at least one usable destination, existing artifacts and their results remain available with `{phase:"rewrite"|"search",error:{code,message}}`. `insufficient` still reports whether the configured minimum was met. A valid null rewrite ends continuation without an error. Initial failures without usable data remain failed outcomes with the concrete continuation cause; cancellation, integrity, resource and unexpected errors remain terminal even after useful results.

Execution for a published destination is its already-completed final discovery trial. Search does not prepare/fetch that artifact a third time. Explicit caller replay is separate. Without page.outputSchema, ordinary automatic schema admission and Prism shaping still occur per source; native HTML wrappers are not the final default result. No fixed business fields or answer-writing model are added. Supply a shared caller schema when consistent cross-source representation is required.

Prepare each returned artifact with mechanical web operations and run `{url}` for current data. Ordering, rewriting and authoring are discovery-only. Source provenance in a report is not a claim that a captured URL list is a reusable universal search artifact.

## Acquisition recovery and evidence

`recoverSearch?: Operation` is an explicitly injected discovery-only HTTP-source recovery hook. Recovered responses must pass the same recognized-results/empty checks. A challenge or unknown layout fails explicitly; a configured no-results marker is not proof of genuine information absence.

The optional [image-choice entry](search-image-choice.md) connects host-owned codec/Jev/form effects. No browser, image codec or general CAPTCHA service loads by default. Normal destination acquisition still exposes its own unsupported cases.

`node scripts/check-search.mjs "<instruction>"` uses the real public path and accepts no saved-page substitutions. Its host can connect image-choice recovery when separately configured. The driver records original requests, captures, raw provider bodies, artifacts and separate AI-free replays under ignored data/runs. Actual SDK rate-limit waits are reactive; failed attempts without usage remain unavailable, never zero-token successes.

Offline search mechanics and actual search-to-discovery integration must be distinguished from fresh search/extraction accuracy. Search uses the same best-effort destination discovery contract; another model experiment is not a first-release gate. Earlier DuckDuckGo/CAPTCHA/search measurements retain their dates and failures; neither recovered acquisition nor successful replay establishes universal search reliability or complete useful results.
