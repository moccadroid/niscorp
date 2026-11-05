# Caller uniqueness constraint: offline success, live discovery unresolved

Only the caller's schema gained `uniqueItems: true`. The request, URL, library code, prompts, model settings, budgets, grading and live test driver stayed unchanged. This was one predeclared live discovery, with a fresh AI-free execution required only if an artifact was returned. No artifact was returned, so that execution was not reached. No further paid retry followed.

## Offline evidence

The existing `artifact.trial` operation executed the unchanged saved output program at its actual output boundary:

- The original schema accepts its two identical PDF URLs.
- Adding `uniqueItems` rejects them with `INVALID_VALUE`: `data must NOT have duplicate items (items ## 1 and 0 are identical)`.
- Four correct controls pass: the same program on its actual HTML-page input, and three saved correct JSON/XML programs with their own array contracts.
- Empty results also pass; uniqueness cannot detect missing results. It compares JSON values and cannot identify different URL aliases as the same resource.

Seven offline checks, zero HTTP and model calls. Neither the saved program nor its returned artifact was manually repaired or republished. Evidence: `data/runs/caller-uniqueness-2026-11-01/offline.json`.

## Live results

| Measure | Previous shared-context run | Caller uniqueness variant |
| --- | ---: | ---: |
| Artifact | Returned; duplicate data | None |
| Strict end-to-end check | Failed on duplicate data | Unresolved before publication |
| Provider requests | 8 | 12 |
| Input tokens | 62,891 | 102,740 |
| Output tokens | 22,118 | 46,402 |
| Discovery time | 57.422 s | 112.542 s |
| Total experiment time | 58.274 s | 112.874 s |
| Fresh artifact execution | 159.302 ms | Not reached |
| Actual rate-limit waits | 0 | 0 |

All twelve new requests succeeded and reported usage. Four live HTTP requests acquired the XML, article, PDF alias redirect and correct canonical PDF. There were no saved-response substitutions or manual model/artifact corrections. The article and PDF bodies match the previous live run. The feed differs only in its top-level response-generation `updated` timestamp; paper entries are unchanged. This is one stochastic fresh discovery, not a controlled repeated-trial estimate of a schema's effect on speed or accuracy.

## Exact failure

The first mapping already includes `$unique`. Its mechanical trial instead fails at `E_VAR_NOT_FOUND`: it defines `hrefArray` inside a `$with.let` object and tries to use it in another binding in that same object. Prism's installed documentation states that those variables are available only inside `value`. A later candidate renames the binding to `hrefs` but repeats the same scope mistake. Both fail before producing a value to validate for uniqueness.

The final provider answer fails the offered output grammar (`data.$unique.$filter: Invalid key in record`). Only one author step remains, so Cortex cannot perform another recovery call. The public outcome is `Mapping author failed. stopped: step limit reached (1)`. This is the configured shared allowance being respected, not a rate-limit or HTTP failure.

Phase accounting:

| Phase | Requests | Input | Output | Provider interval |
| --- | ---: | ---: | ---: | ---: |
| Task | 1 | 671 | 1,649 | 3.611 s |
| XML author | 1 | 2,197 | 1,807 | 4.177 s |
| Reference author | 2 | 15,113 | 8,818 | 19.422 s |
| HTML author/repair/inspection | 5 | 61,113 | 17,415 | 39.759 s |
| Output author | 3 | 23,646 | 16,713 | 35.919 s |

The HTML work also explains why the mapping had little allowance left. The initial rule repeats its result selector as a precondition. JSON rejects this and correctly narrows correction to conditions. Two subsequent source inspections replace the single current-feedback value with their observations; the active rejection is no longer present there. A later proposal repeats the rejected condition before the next attempt fixes it. This is a concrete feedback-retention issue to investigate separately, not a reason to restore full conversation history.

## Learning and decision

The caller constraint is mechanically effective, and the first fresh mapping visibly attempts uniqueness. This experiment did **not** demonstrate successful live generation or model repair of duplicate output. It is not evidence to raise limits, switch models or add another reviewer. No production change is needed to retain the caller's existing ability to request uniqueness; it has not become a new default or automatic-schema keyword.

A separate input-contract issue is visible in every mapping request. Resource acquisition already knows the canonical downloaded URL and deduplicates the resource, but mapping receives page records containing an inferred absolute reference and an original relative HTML link. Resolved resource identities are excluded from the mapping input. The model consequently writes URL splitting/joining and scoped-variable logic to reconstruct a fact already computed mechanically. Supplying a bounded projection of those resource identities could turn URL-list authoring into a simple projection, while resource bodies remain excluded and fields remain dynamic. That would change the approved internal input contract and is a proposal for discussion/review, not implemented work or evidence of success.

Preserve the original duplicate-output failure and this unresolved variant separately. The unchanged grading still requires one observed PDF URL per resource. Evidence: `data/runs/live-pdf-caller-uniqueness-2026-11-01/`, including input/scope, complete code snapshot, raw provider requests/responses, HTTP captures, trials and summary. Frozen files remained unchanged. No source/library/model/engine changes were made for this experiment.
