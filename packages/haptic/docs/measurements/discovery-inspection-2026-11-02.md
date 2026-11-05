# Discovery inspection correction — 2026-11-02

The user approved simpler inspection requests, deduplicated context, scoped follow-up HTML and a JSON exact-repeat guard. The mechanics improve; the fresh Guardian task remains unresolved.

## Implementation and ownership

The strict model contract is `{action:"inspect",source,query,window:{offset,limit}}`. HTML/XML windows are required, without nested aliases or one-element defaults. JSON `frontier-sources` derives one current owned representative per actual frontier URL/body hash; context and inspection share it. The parallel `sourceMessages` state is deleted.

JSON `observations.skipRepeated` reuses only the latest identical inspection on the same capture, including full query/fields/window. Earlier windows remain inspectable after a different request. `observations.useScopedHtml` supplies successful nonempty prepared subtrees for the matching source, explicitly marked partial. Counts, ranges, omissions and fields remain visible. Failed/empty/fully omitted views retain full context; other frontier sources remain unchanged. Original trial sources remain intact.

One shared JSON projection removes expanded historical HTML while retaining own actions, failures and observation facts. Current feedback is not duplicated verbatim in history. Engine, model adapter, dependencies, permissions and allowances are unchanged. No new model, native planner, persisted cache or retry framework was added.

## Verification

`pnpm typecheck` and `pnpm check` pass. Seven focused groups cover strict windows, retained history, deduplication, exact reuse, changed windows/fields/hashes, frontier isolation, duplicate repair captures, stale indices, fallbacks, switches, cancellation and bounds. The local Cortex wire regression also passes with one source body during repair.

Saved Guardian inspection displays ten elements. Including retained own history, follow-up context falls from **358,388 to 11,348 characters**. This measures context construction, not provider tokens or model accuracy. Recorded AI-free replay preserves the successful Guardian 161-entry and timetable 19-record controls exactly. The separate required HTTP-only live PDF regression passes.

Four independent checkpoint roles finish at 9/10 for structure/contracts/mechanics, after identifying and fixing duplicated current source context during semantic repair. Their grades do not establish model accuracy.

Offline evidence: `data/runs/discovery-inspection-2026-11-02/`.

## Fresh unchanged-request comparison

Input remains URL `https://www.theguardian.com` and instruction `get me the headlines and abstract/description of the top 10 articles from theguardian.com`. No schema/selectors/answers/manual corrections were supplied. The previous explicit 2 MB reader and text-preparation profile remains, with only the new observation switches added. Link following remains disabled. Source/workflow/profile files remained frozen during the live run; no saved HTTP substitutions occurred.

| Metric | Before | After |
| --- | ---: | ---: |
| Published artifacts | 0 | 0 |
| Provider requests | 18 | 16 |
| Responses with usage | 10 | 12 |
| Reported input tokens | 1,097,191 | 773,154 |
| Reported output tokens | 17,098 | 41,551 |
| Total seconds | 221.438 | 165.555 |
| Actual quota wait seconds | 131.067 | 32.043 |
| Seconds excluding quota waits | 90.371 | 133.512 |
| Final AI-free executions | 0 | 0 |

Input falls 29.5%; output rises 143.0%. Total time falls because quota waiting falls; time excluding waits increases. Four new HTTP429 responses have unavailable usage. The prior seven quota responses and one context error also have unavailable usage, never zero usage.

Scoped source calls use 7,661–12,675 input tokens. Failed field inspections have no scoped HTML and restore the expensive full view. Exact-repeat reuse never triggers because the model varies queries/fields/windows. The author makes nine admitted inspections and one final proposal, plus one malformed-envelope recovery. Its last proposal repeats the result selector as a precondition; existing admission rejects `INVALID_PRECONDITIONS` and narrows correction to `conditions`, with no author allowance remaining. An unchanged-proposal offline trial reproduces that rejection without models or HTTP.

No schema, mapping, final review, published artifact or final execution occurs. The run ends on allowance exhaustion rather than context overflow. This does **not** solve unproductive exploration. Further work should address producing a candidate early enough for actual trial correction, rather than expanding allowances or claiming syntactic-repeat detection understands semantic progress. Many homepage descriptions are genuinely absent; that separate coverage issue remains. No further paid repeat or prompt tweak followed.

Fresh evidence: `data/runs/live-theguardian-top10-inspection-2026-11-02/`, especially `comparison.json`, raw requests/responses and `final-proposal-trial.json`. Prior failure remains unchanged under `data/runs/live-theguardian-top10-descriptions-2026-11-02/`.
