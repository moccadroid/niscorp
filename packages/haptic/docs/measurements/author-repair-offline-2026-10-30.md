# Generic author repair and relevance policy — offline, 2026-10-30

> Tooling retirement, 2026-11-01: commands and runner paths below describe this historical experiment. The one-off saved-authoring/navigation/CAPTCHA research drivers were removed during handoff cleanup; original captures, failed results and archived tool snapshots remain in ignored evidence. Current offline contracts are tested through the maintained `tests` suite. Optional codec use is documented in the current image-choice contract; historical Sharp instructions are not current setup instructions.

## Changes

The existing JSON author policy now requires task-supported records, complete record containers when declaring fields, and requiredness justified by the request/schema. It explains parsed-HTML repair and diagnostic elision. The existing reviewer policy explicitly checks precision and completeness: a broad page theme or superset containing some requested records is insufficient; explicit applicable category metadata may support records unless contradicted. Rejection must identify an observed counterexample and unmet requirement. No site names, event exclusions, native relevance filter, extra model call or artifact-grammar change was added.

The existing indexed selection helper now supplies bounded diagnostic outlines from the same parsed DOM. Zero-match failures can include the author's own page anchors and their parent/sibling structure. Field failures identify the actual zero-based record index, DOM path and local structure. Successful extraction remains unchanged.

`profile.matchLimits.diagnostics` owns the limits: 8,192 serialized bytes **per diagnostic report**, three witness nodes, three ancestor levels, and allowed attribute names/prefixes. This does not bound the entire multi-page feedback message. Missing configuration disables extra observations. Outlines mark omitted nonempty text and report budget truncation; they are not full HTML captures. Attribute values reuse the enabled HTML-context clearing policy and implementation. No source rewrite or second sanitizer was introduced.

## Six unchanged saved candidates

Inputs came from `data/runs/search-connected-2026-10-30T00-17-29-394Z`. No source, selector or answer was corrected. The runner forbids network/model fetches and invokes mechanical validation plus a verdict-free review-input capture.

| Case | Before | After offline changes |
| --- | --- | --- |
| Meetup attempt 1 | Zero matches; 232-byte feedback | Still rejected; 2,365-byte feedback shows heading wrappers and actual list relationship |
| Meetup attempt 2 | Zero matches; 259-byte feedback | Still rejected; 2,150-byte feedback shows heading ancestry and actual list sibling |
| Meetup attempt 3 | Missing title; 88-byte feedback | Still rejected; 3,700-byte feedback identifies record 0 as an image anchor and shows its containing record |
| Comic Con candidate | Mechanically valid 15-item selection, semantically broad | Still mechanically valid; all 15 unchanged records reach the stricter reviewer instructions |
| Successful listing control | Three native records | Passes; exact original records/paths/attributes unchanged |
| Successful single-record control | One native record | Passes; exact original record unchanged |

Three out of three saved failures now carry the intended structural witness. Diagnostic payloads are 2,118 / 1,876 / 3,530 bytes, below 8,192. Two out of two saved successful controls remain identical. Six out of six sources are unchanged. These are feedback/protocol results, not repaired candidates or model accuracy scores.

The Comic Con check captures the actual `html.review` operation input, including the original task and full trial. It deliberately provides no semantic verdict (`OFFLINE_CAPTURE_ONLY`). **No offline semantic rejection is claimed.** A model ignoring the instructions could still accept that candidate. No keyword blacklist or native interpretation of its saved yes/no verdict was added.

## Verification and limits

Typecheck and full offline checks pass, including 21 benchmark-support checks. Controls verify parsed structure, record identity, text elision, source immutability, configured bounds/bypass, cancellation and cleared-attribute consistency. Existing local Cortex tests confirm enriched feedback reaches repair; synthetic mock repair is not a fresh repair of these saved failures.

Four independent roles reviewed grammar/contracts, execution, quality and Nisc alignment. Modest findings were fixed: direct-text omission markers, source-array indexing, cancellation with no observations, and cleared attributes re-entering diagnostics. No full-crew repeat was needed.

No paid/model calls were made. After offline verification, the required separate HTTP-only PDF check passed at `data/runs/live-pdf-2026-10-30T01-34-57-982Z`, preserving the original 116,547 bytes/hash. Engine files and dependency lockfile are unchanged. The internal selection helper was replaced directly, without a compatibility alias or sibling framework.

`node scripts/check-saved-authoring-repairs.mjs` reproduces the checks and saves new directories under `data/runs/author-repair-offline-*`, including policy, exact author instructions, case results and reviewer operation input. That input is not a provider request. Earlier partial harness/check failures remain retained. Actual 120b repair/rejection and successful-control accuracy still require a focused model evaluation, which was not run.
