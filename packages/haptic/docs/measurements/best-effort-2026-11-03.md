# Best-effort discovery — 2026-11-03

The user explicitly required usable partial results rather than withholding everything for query shortfalls. Discovery now separates extraction mechanics from invented completeness requirements. One fresh Guardian request returns a usable artifact with ten headlines, four descriptions and six explicit nulls. The same artifact returns nine records on a controlled nine-record source variant.

## Policy and ownership

- HTML source proposals and inspections offer selectors/reads, not page preconditions or field match bounds. JSON supplies `preconditions:[]` and profile `authoring.fieldBounds` (default minimum0/maximum null) before measurement, trials and storage.
- The retired conditions schema, author operation, focus choice and error routing are deleted. Executable rule schemas/readers still support explicit preconditions and bounds; existing artifacts are unchanged.
- The default authoring profile permits overlapping records. Existing semantic review can explain quality shortcomings; it remains advisory with bounded repair and retention of a working artifact.
- Original generated schemas must compile first. The pure JSON `generated-schema` helper then recursively makes object fields optional/nullable, preserving non-null types, array items, associations and undeclared-field restrictions. One normalized schema feeds mapping, review, trials and publication. Caller schemas bypass this policy and remain unchanged.
- A request for ten records is an upper target, not permission to invent a ten-match execution gate. Source values remain source-supported; unavailable fields can be absent/null. Invalid selectors/programs, explicit caller contracts, permissions, cancellation, integrity, transport and resource controls remain enforced.
- JSON owns these choices. TypeScript changes are model-facing schemas and derived contracts. Engine, readers, common model adapter and dependencies are unchanged. No fallback framework, database, additional model or runtime AI was added.

## Offline verification

`pnpm typecheck`, full `pnpm check` and the required HTTP-only PDF check pass. Four independent checkpoint roles finish at 9/10 for the inspected mechanics/ownership, with no material production finding. Stale model-facing fixtures were updated separately from retained strict runtime-reader tests. The nested generated-schema regression passes: missing/null fields are admitted, while wrong non-null values, null array records and undeclared fields are rejected.

The full discovery fixture returns nine records, including one missing description and multiple heading matches, despite a rejected semantic review and a failed correction attempt. Its emitted artifact independently returns those nine records without AI. A caller-supplied `minItems:10` schema still rejects nine and bypasses generated-schema normalization.

Two saved Guardian proposals previously blocked by a ten-match precondition now complete source trials with no HTTP/models. This does not regrade them as good final answers: their original selection finds one container/one extracted headline value. The evidence demonstrates removal of the hard gate, not completeness. The separate generic nine-record integration fixture proves full partial-artifact publication.

Recorded AI-free replay preserves both earlier successful artifacts exactly: Guardian161 entries and timetable19 records. Original failed trials and source captures remain unchanged. Offline evidence is under `data/runs/best-effort-2026-11-02/`; the slice crossed local midnight. Earlier failed check logs remain historical failures; `check-final.log` is the successful complete check.

## One fresh unchanged-request run

Input remains URL `https://www.theguardian.com`, instruction `get me the headlines and abstract/description of the top 10 articles from theguardian.com`. No schema, selectors, answers or manual corrections were supplied. All website responses are fresh. The previous explicit 2 MB reader and text-preparation host configuration is retained, as are 120b/high/temperature1/topP1/emit, permissions, total allowances and proposal cadence. Page contents/date differ from earlier runs; this is not an identical-input statistical comparison.

| Metric | Previous proposal-first attempt | Best effort |
| --- | ---: | ---: |
| Returned artifacts | 0 | 1 |
| Headlines | none | 10 |
| Descriptions | none | 4, plus6 nulls |
| Provider requests | 17 | 6 |
| Responses with usage | 10 | 6 |
| Reported input tokens | 1,078,421 | 284,489 |
| Reported output tokens | 27,517 | 8,256 |
| Total seconds | 224.119 | 34.328 |
| Actual quota wait seconds | 111.078 | 0 |
| Seconds excluding quota waits | 113.041 | 34.328 |
| Independent artifact preparation | not reached | 56.077 ms |
| Independent artifact execution including HTTP | not reached | 192.949 ms |

All six responses report usage. The phases are task1, source1, schema1, output2 and review1. The current reviewer accepts; no semantic retry runs. No model call occurs during execution. Six website HTTP requests cover initial discovery, fresh final verification and independent execution (each includes the homepage redirect).

Independent captured-source checking confirms all ten headlines and all four descriptions are supported by their selected cards. The six null-description cards have only their headline/kicker/time text and no preview; they are not silently invented or discarded. This checks the selected main news cards, not universal ranking/completeness.

## Actual artifact with only nine records

The unchanged artifact is prepared once against recorded transport and run on a controlled variant retaining only the first nine learned record containers. It completes with exactly the first nine live-result records, zero model calls and no live HTTP. The artifact itself is not edited. The variant is separate from the original sources and is not a saved-page substitution in the live run.

Fresh evidence: `data/runs/live-theguardian-top10-best-effort-2026-11-03/`, especially `artifact.json`, `fresh-execution.json`, `generated-schema.json`, `independent-grade.json` and `changed-source-nine-execution.json`. Source/workflow/profile hashes remain frozen throughout the live run. These results establish this case and the controlled partial-data behavior; they do not establish full-suite accuracy or universal future-layout reuse.
