# Proposal-first source authoring — 2026-11-02

The user approved making the first source response a proposal, mechanically trying it immediately, and limiting correction inspections without increasing the total allowance. That cadence is implemented and verified. The fresh Guardian task still returns no artifact.

## Ownership

JSON `source-request` selects `responseMode`: `propose` initially, or `inspect-or-propose` after a proposal while the configured inspection count remains. `observations.maxInspectionsBetweenProposals` defaults to two; zero disables inspections. The native source adapter mechanically indexes the corresponding derived schema. Cortex still owns schema recovery, within the existing allowance; the common model adapter is unchanged.

JSON frontier-local `sourceProposed` and `inspectionsSinceProposal` state is reset by acquisition. Admitted proposals reset the count even when rejected mechanically; every admitted inspection counts, including failed queries and repeated-observation reuse. Component narrowing and recursion do not reset counts. Neither transition renews model allowances. HTML and XML source jobs share this mechanism. Bare Prism writers, permissions, model settings, engine and dependencies are unchanged. No new flow, planner, controller, callback or persistence is introduced.

## Offline evidence

`pnpm typecheck`, `pnpm check` and the required HTTP-only live PDF check pass. Focused integration tests cover rejected initial proposals, limits zero/one/two, failed and repeated inspections counting, mandatory reproposal, next-frontier reset, paired XML correction and AI-free artifact execution. Mock source providers now enforce the offered mode instead of accepting forbidden inspection answers.

The localhost Cortex wire test offers a proposal-only schema, deliberately returns an inspection, then returns a proposal. Recovery succeeds in exactly two charged steps. Missing response mode fails before the provider effect. This is controlled protocol evidence, not 120b accuracy.

Recorded AI-free replay preserves the successful Guardian 161-entry and timetable 19-record controls exactly. Four checkpoint roles finish at 9/10 for this slice's mechanics/ownership/quality. The later live routing defect below is an existing correctness limitation, not covered by those scope grades. Some independent reviewer localhost executions could not connect; parent executions and preserved logs passed. No external or paid models were used for offline checks.

Offline evidence: `data/runs/proposal-first-2026-11-02/`. Earlier failed test logs are retained; `check-final.log` is the passing complete check.

## One fresh unchanged-request comparison

Request remains `get me the headlines and abstract/description of the top 10 articles from theguardian.com` at `https://www.theguardian.com`. No caller schema, selectors, answers or manual corrections were supplied. The existing explicit 2 MB reader/text-preparation profile, high reasoning/temperature1/topP1/emit, permissions and total allowances remain. Only the new inspection-cadence limit is added. All sources are fresh HTTP; source/workflow/profile stayed frozen.

| Metric | Before proposal-first | Proposal-first |
| --- | ---: | ---: |
| Published artifacts | 0 | 0 |
| Admitted rule proposals | 1 | 4 |
| Executed inspections | 9 | 0 |
| Provider requests | 16 | 17 |
| Responses reporting usage | 12 | 10 |
| Reported input tokens | 773,154 | 1,078,421 |
| Reported output tokens | 41,551 | 27,517 |
| Total seconds | 165.555 | 224.119 |
| Actual quota wait seconds | 32.043 | 111.078 |
| Seconds excluding quota waits | 133.512 | 113.041 |

The first source response is a proposal. Its mechanical observation reports overlapping records and offers a selection correction. Further proposals occur before exhausting the allowance. The live run does not exercise the two-inspection ceiling: attempted inspections are schema-invalid and none execute.

Of the 27,517 reported output tokens, 26,270 are reasoning and 1,247 are other output. Seven HTTP429 responses have unavailable usage, never zero usage. More input and quota waiting make this fresh run slower overall. No schema/mapping/final review/final artifact or final execution occurs.

## Concrete blocker found

The initial rule requires at least ten matches of `section#news li a.dcr-bvbu91`; the actual captured source has nine. After correcting overlap, the stage trial fails that precondition. Discovery nevertheless continues offering only selection/field edits, leaving the failing precondition frozen. Two unchanged live model proposals reproduce this route offline with zero HTTP/models. `observe-source` is byte-equivalent as JSON to the pre-slice version: this slice exposed, rather than introduced, that routing defect.

The final source invocation also emits three inspection replies with `source:{index:0}` instead of the required numeric source index. Existing Cortex recovery rejects them and stops at its three-step limit. This is the terminal public reason; it must not be described as successful inspection or solely as global allowance exhaustion.

The cadence change therefore does not establish improved end-to-end success. A generic correction to failed-trial component ownership is the next issue to address; no such routing patch or further paid rerun was made in this slice. More inspection allowance would not make a frozen failing precondition editable.

Fresh evidence: `data/runs/live-theguardian-top10-proposal-first-2026-11-02/`, including raw provider requests/responses, `comparison.json` and the separate `routing-diagnostic.json`. The latter is offline diagnosis of unchanged proposals, not a fresh discovery or manual repair. Prior failed runs remain unchanged.
