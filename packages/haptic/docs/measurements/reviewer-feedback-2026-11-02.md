# Reviewer feedback, own-job history and independent publication

The user replaced terminal semantic rejection with an explicit new contract: send the verdict back to the author with its own history, give it a bounded correction opportunity, and return a mechanically working artifact regardless of a negative semantic verdict. Caller schemas and permission ceilings remain fixed. There is no manual approval step.

## Ownership and behavior

`discovery.json` owns the fixed `build-result` repeat, message construction, source reuse, budget checks, candidate retention and publication. `default-profile.json` sets `review.maxRepairs:1`; zero disables correction without suppressing rejected working artifacts. Native changes are profile validation and derived helper/public contracts in `index.ts` and `blueprint.ts`. Search consumes `ready` results and preserves the verdict. No engine file, model adapter, dependency or native retry callback changed.

On negative review, remaining author allowance permits the same fixed source/schema/mapping pipeline to run again. It repeats all relevant jobs, including already-correct work; there is no selective repair planner. Caller schemas stay unchanged. An automatic schema may be reauthored after repaired source extraction and is fixed for that pass's mapping.

Histories are scoped to each source/reference/contract/output job and its source frontier. They preserve the author's JSON proposals, their mechanical observations and each delivered reviewer-feedback turn. Current source bodies appear once per invocation; other agents' prompts and whole source bodies are not stored in history. A third pass retains both earlier review messages, without duplicating feedback during local mechanical retries. Cortex continues to own malformed-envelope/schema recovery inside each invocation.

Author/reviewer time and step allowances never reset. Owned page/resource captures, aliases and discovery charges survive correction. Invalid corrections can restore the preceding working candidate with its matching schema and verdict. JSON declares recoverable acquisition errors: the exact ordinary rejected-status check, HTTP transport errors and HTTP timeouts. A separate unrecorded check stops everything outside that allowlist, including corrupt body/hash and XML resource limits. Cancellation and engine/resource controls remain terminal.

Fresh complete mechanical URL-artifact verification is still required. Success returns `status:"ready"`, an artifact and independent review metadata. `review.decision.accepted` can be false; null/unavailable review does not suppress a working artifact. `repair:{attempts,reason}` reports correction attempts and a failed-correction warning. A failed fresh mechanical trial cannot publish. Finished execution contains no AI or history machinery.

## Offline verification and reviews

Evidence: `data/runs/reviewer-feedback-2026-11-02/`, final check log `check-verified.log`. Typecheck and the full offline suite pass. Twelve focused feedback groups cover:

- Own-job history plus verdict delivery, without cross-job prompt replay.
- A corrected candidate that passes review; a still-rejected candidate that still returns an executable artifact.
- Zero correction allowance and exhausted author/reviewer allowances without resets.
- An invalid correction retaining the preceding artifact/schema/verdict.
- Generated-schema history and unchanged caller schemas.
- Two correction passes retaining both earlier reviews and proposals.
- Reused captures and one-page/one-resource caller ceilings.
- Ordinary child HTTP403 fallback with accurately retained spent author allowance.
- Terminal corrupt-body and actual XML node-limit errors, with no fallback publication.
- JSON/XML feedback repair and AI-free corrected execution.
- Fresh mechanical failure still preventing publication.

A separate test uses the actual Cortex adapter against a local fake provider. Seven local requests exercise task → source → mapping → rejection → source correction → mapping → acceptance. The exact wire shows the second source and mapping jobs receiving their own assistant answer and review feedback. A separate mechanical execution uses no AI. This is protocol evidence, not paid-model accuracy. Search has an additional check retaining a ready artifact with negative review. Existing historical fixtures and accuracy labels remain unchanged.

The four independent roles finish at 9/10: Nisc alignment, generic grammar/quality, execution/correctness, and overall architecture/code quality. They identified public metadata missing from the root contract, lost earlier feedback under multiple repairs, and ordinary child failure bypassing candidate retention. Those were corrected. Rechecking the child fallback exposed overly broad recovery of integrity/resource failures; the JSON allowlist and unrecorded terminal check now cover that distinction. The original reviewers independently rechecked the material fixes. No remaining material finding was reported. Grades are engineering review judgments, not model accuracy scores.

The initial resource-replay test failed because its replay helper defaulted to an unrelated label fixture; `check-complete.log` preserves that failed run. The test now supplies its resource page explicitly. The final full check passes. No production artifact or grading expectation was changed to hide that test failure.

The required live HTTP-only PDF regression passes with one 116,547-byte PDF and zero model calls. All 11 engine files and `model.ts` match this slice's initial hashes. The production delta is five source files. Current public/development/plan/AGENTS documentation reflects the revised user contract.

## One fresh original timetable run

Evidence: `data/runs/live-animafabrik-review-feedback-2026-11-02/`. The request is byte-identical to the earlier demos: `Give me the timetable of animafabrik.com.` at `https://animafabrik.com`, link following enabled, depth 2, max pages 5, resources disabled. No schema, timetable URL, selectors, mapping or manual correction was supplied. All discovery and independent execution sources were fresh HTTP; retained in-run captures are not substitutions from older runs. Source/workflow/settings/package/input snapshots and raw provider bodies were frozen and preserved.

**A mechanically ready artifact was returned. Independently checked class records: 19/19, in captured and fresh AI-free execution.** The checked fields are day, time, class, teacher, duration, level and per-class options. This is not a completeness claim for every page-level notice.

The source author followed the timetable link, selected individual class records, and used `closest:".menu-section"` for each class's weekday. The mapping initially misused same-block Prism variable scope; mechanical feedback and Cortex output recovery produced the final program. No program or source rule was manually corrected.

| Measurement | Result |
| --- | ---: |
| Provider requests | 12 |
| Input tokens | 193,955 |
| Output tokens, including reasoning | 44,546 |
| Sum of provider times | 107.934 s |
| Discovery time | 117.159 s |
| Total including independent execution | 117.706 s |
| Independent artifact preparation | 47.397 ms |
| Independent execution, including two HTTP requests | 109.258 ms |
| Rate-limit wait | 0 |
| Execution AI calls / manual corrections | 0 / 0 |

All 12 responses reported usage. Six website HTTP requests: two initial captures, two for final complete verification, two for independent execution. Frozen files remain unchanged.

The reviewer accepted the final data, and `repair.attempts` is zero. Therefore this live run proves automatic source/Prism authoring and fresh mechanical execution, **not real-model correction after a semantic rejection**. That rejection/correction path is proven by controlled offline protocol tests. The success must not be causally attributed to a semantic repair that did not happen.

## Reuse checks and remaining failure

The unchanged generated artifact was executed against controlled offline variants after the live run:

| Variant | Result |
| --- | --- |
| Changed weekday, class, teacher and duration | 19/19 records match |
| Added class within a day | 20/20 records match |
| Empty timetable | Fails explicitly: `E_MISSING_PATH` for `$.input.pages[0].items` |

The first verification harness did not catch the empty-case exception. Its original script and interruption are preserved; the reporting harness now records that same failure without changing the artifact or its failed grade. No extra paid discovery followed.

The learned rule also uses a generated page-container identifier. Today’s and changed-value/added-record checks do not establish cross-page/layout compatibility or future identifier stability. The empty-result failure and these limits remain visible; no runtime AI or new repair layer was added.
