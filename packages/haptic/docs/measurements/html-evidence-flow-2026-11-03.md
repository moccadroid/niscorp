# HTML evidence delivery — 3 November 2026

The approved author/reviewer evidence flow is implemented and verified offline. Both roles receive literal prepared HTML, explicitly scoped views and continuation information. Failed inspections no longer force a source proposal. Review can inspect owned HTML captures without HTTP, and negative/unavailable review preserves a mechanically working artifact. No paid model evaluation was run.

## Ownership and deletions

`html-evidence.json` owns the shared `html-model-view` projection. It shows a fitting complete prepared document, otherwise uses the existing mechanical `html.view` operation. Its initial selector/window is profile data (`*`, offset 0, limit 32 by default), not a source-selection or extraction limit. Empty initial windows advance via `nextOffset` before any model call. Whole subtree omissions carry original paths, tag names and byte sizes. Overlapping descendants already present in a rendered ancestor are not repeated in HTML.

`discovery.json` constructs source requests from actual views and preserves current-frontier URL/hash authority. Every offered source remains identified. There is no warning-only HTML author call. Removed source `responseMode`, `sourceProposed`, `inspectionsSinceProposal` and `observations.maxInspectionsBetweenProposals`, with their unused native selection and old forcing tests. Source responses always permit inspection or a component proposal under the same author allowance.

`result-review.json` owns a fixed reviewer inspection loop. The response schema permits the existing HTML inspection shape or the existing `{accepted,reason}` verdict. Inspection can only read the HTML captures supplied as review evidence; it cannot fetch URLs. JSON owns the scope checks, view selection, history, budget subtraction and final verdict/unavailable result. Cortex schema-recovery steps, time and usage are accumulated, not renewed per inspection. The outer discovery pool is charged once for the aggregate.

Literal HTML is sent separately from metadata. The active view is included once; histories retain own actions and earlier observation facts without historical HTML bodies. Current observation metadata is not repeated in both history and the active view. XML selected-value feedback is retained unchanged. Both roles preserve the caller's reference time.

TypeScript changes are mechanical: response/boundary schemas, registration, optional hash on borrowed HTML view input, and explicit omission metadata. Author source identity checks remain unchanged. A display budget too small even for metadata becomes a typed recorded failure. If omission metadata fills a display window, `html.view` stops with an explicit continuation instead of throwing away the whole view. Parser/resource/cancellation controls remain terminal.

All four new helpers have derived contracts at the existing blueprint composition boundary. Model-view choices, prompts, branches and publication remain JSON. The engine, published Prism mapping agent, dependency versions and sibling workspace are unchanged. Paired XML mapping remains the previously documented separate ownership task.

## Verification

`pnpm typecheck` and the full `pnpm check` pass. Six new focused groups verify:

1. Real HTML before the first reviewer call; explicit omissions; scoped HTML once; own inspection history and negative verdict retained.
2. Out-of-scope source indices produce feedback with no HTTP and can be corrected.
3. Invalid CSS returns the actual mechanical failure to the same review.
4. Inspections exhaust the original allowance and return unavailable, never an inspection object as a final verdict.
5. A response consuming two Cortex steps charges those steps and tokens once, reducing the next call to its remaining allowance.
6. Deep oversized wrappers with a readable record after the first window are handled by JSON continuation. Truly impossible windows return explicit unavailability without a model call.

Two complete discovery controls additionally prove that a partial working artifact survives a reviewer inspection followed by either a negative verdict or exhausted review, and executes without AI. Existing author-loop checks now allow zero, one and three inspections without forced reproposal; current failures and XML observations remain intact.

Saved-source verification preserves 17/17 source-selector counts and 31/31 previously published artifact execution outputs, with no network/model effects. These checks preserve prior behavior, including any semantic shortcomings; they are not new discovery accuracy measurements. Citation PDF metadata is preserved. The required live HTTP-only PDF regression passes without models.

Evidence: `data/runs/html-evidence-flow-2026-11-03/`, including `check-release.log`, `typecheck-reviewed.log`, `offline-saved.json`, `live-pdf.log` and exact final author/reviewer wire captures. Failed intermediate checks remain preserved.

## Exact saved-page message measurements

Real Cortex requests were sent through a local deterministic HTTP server. That exercises the actual response schema, emit instructions, model-input guard and message encoding, but performs no AI inference. Original Guardian/Spiegel captures were prepared through the actual library path; no live page was substituted.

| Saved page | Full prepared HTML bytes | Author message bytes | Previous reviewer message bytes | New initial reviewer message bytes |
| --- | ---: | ---: | ---: | ---: |
| Guardian | 628,788 | 17,616 | 653,682 | 18,006 |
| Spiegel | 1,370,356 | 17,121 | 1,438,504 | 18,462 |

The message figures are JSON-encoded message arrays, including Cortex's instructions/schema, not provider token counts or the complete HTTP request size. Four local provider requests were made; remote model calls and network acquisitions were zero. Both roles received actual HTML and explicit omissions. Both reviewer requests passed the guard that previously rejected their whole-page inputs.

**The new figures describe initial partial views, not equivalent whole-page evidence compressed into fewer bytes.** The remaining HTML stays owned and inspectable. Initial broad windows can contain document metadata rather than requested record content; the model must inspect further when needed. Total requests, tokens, latency and semantic results require a real model follow-up. None is claimed here.

## Independent checkpoint reviews

Four roles close at 9/10 for this scoped engineering change: Nisc ownership, execution/correctness, generic grammar/context, and code quality. They do not grade model accuracy.

The reviews caught and verified corrections for:

- A first window could contain only oversized ancestors despite readable content later. JSON now follows continuation, and both model roles are gated on displayable HTML.
- Reviewer `asOf` initially read from the wrong state level; a subsequent broad correction also touched loop history. Original request time and loop-owned history/feedback now use their correct paths, with no null message entries.
- Active inspection metadata appeared in both history/current feedback and the view. Current facts now appear once while earlier observations remain available.
- New helper contracts were initially broad, and retired counters remained declared. The four contracts are now derived and strict, and retired fields are removed.

## Outcome and remaining proof

The context-delivery and partial-publication mechanics work offline. This does not establish that 120b now authors correct Guardian/Spiegel selectors, constructs correct URLs or produces correct semantic reviews. The next accuracy proof is a focused fresh discovery of those two requests, with AI-free artifact execution and independently checked data, before any wider batch. No further prompt/limit tuning or paid run was performed in this slice.
