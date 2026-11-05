# Optional codec and discovery decision consolidation — 2026-10-30

Two authorized changes, performed in order: finish the optional CAPTCHA image adapter and verify it offline, then consolidate repeated decisions in discovery JSON. No engine changes, new DSL operators, website corrections, model prompts, paid calls or fresh semantic accuracy claims.

Subsequent [template-binding cleanup](template-binding-cleanup-2026-10-30.md) removes the positional binding coupling identified as remaining below; this report's earlier measurements remain unchanged.

## Optional codec

`src/search/image-choice/sharp.ts` implements the existing `prepareImages` callback. Sharp 0.35.5 is pinned for development verification and declared as an optional peer (`^0.35.5`) for consumers. Only the explicit `search/image-choice/sharp` entry imports it. The live host dynamically loads that entry when recovery is invoked. Core execution, search and recovery contracts remain codec-independent. The research Node driver consumes the same exported preparer. The old PowerShell implementation was deleted; no live adapter imports benchmark files or launches a shell.

The JSON codec profile owns minimum dimensions, background and input/output bytes/pixels. Native work validates source identity/status/integrity, decodes one image, center-pads without resizing and writes a PNG asset under the original tile ID. Invalid/multi-frame inputs fail. No image classification or website decision lives in the codec. Settings and invocation data are owned before asynchronous work. Cancellation is checked around native awaits and before publication; an already running native codec task is not forcibly interrupted.

Offline checks verify all six source pixels survive a small PNG's odd-sized centered padding, border color, immutable inputs, owned settings, JPEG conversion and unchanged larger dimensions. Failure checks cover missing/duplicate/wrong tiles, status, mismatched body digest, invalid image, two-frame GIF, input bytes/pixels, output pixels/bytes and cancellation. A fresh process blocks Sharp resolution: ordinary execution and image-choice imports succeed, while importing the explicit codec entry fails. This is an unavailable-codec import probe, not an install test on a second operating system.

The existing local HTTP recovery test now uses the actual Sharp adapter and real JPEG bytes. Vision remains an explicit offline simulated response. It verifies downloaded images reach preparation, one vision response selects source-owned controls, both source forms are preserved and continuation reaches the configured local result. Existing rejection, origin, charset and cancellation controls remain. It does not establish new live CAPTCHA-solving accuracy.

The replacement research command also prepared all nine original saved challenge images successfully; output dimensions equal the larger of original dimensions and the JSON minimum, and every output is PNG. No vision calls or submissions were made. The initial setup pointed at the module-results folder, which contains prepared PNGs but not original JPGs, and failed before decoding; that setup failure is recorded separately. The successful run used a copy of the original acquisition folder. Originals and previous results were not modified.

## Discovery JSON

Existing producer mappings now own named derived values:

| Decision | Prior repeated definitions | Current owner |
|---|---:|---|
| Navigation/resource requirement | 9 | One task predicate in `format.output.route` |
| HTML-or-reference route | 5 | `format.output.route` |
| Caller output-schema presence | 9 | `profile.output.hasOutputSchema` |
| Learned stages ready | 4 | `learn.output.ready` |
| Final unshaped publication eligibility | 2 | One root output `$with` binding |
| Individual trial failure test | 3 | Pure JSON `qualify-trials` helper |

One existing-grammar helper computes `{passed}` for the complete trial collection. The nonempty/all-completed/no-errors predicate is unchanged, including both outer operation outcomes and inner artifact outcomes. Review, acceptance and repair consume it. Attempts retain raw trials and add `trialsPassed` as a diagnostic; no evidence is replaced. Failed or skipped authoring cannot gain publication through an empty trial collection. Permission ceilings, profile defaults, model settings, prompts, trials and bounded repair policy are unchanged.

The helper has no effect operations and requires no native interpreter feature. Deep artifact-template binding was intentionally left unchanged. This is bounded factoring, not a new planner/compiler or whole discovery rewrite.

| Program measurement | Before | After |
|---|---:|---:|
| Lines, identical two-space JSON formatting | 5,778 | 5,310 |
| Formatted bytes | 203,216 | 184,701 |
| Compact bytes | 50,280 | 47,943 |
| `$ref` expressions | 448 | 431 |
| `$get` expressions | 149 | 133 |

The 468-line reduction includes replaced duplicated expressions plus the new shared qualification expression. It is not a whitespace/minification result. The remaining 5,310 lines still include the previously audited artifact construction and positional template binding; this is not a claim that all discovery wiring is now elegant.

## Verification

- Typecheck passed. Complete final offline check passed: 127 `[pass]` groups and 21 benchmark-support/pacing tests, zero failures.
- Focused image preparation: four groups; recovery: five groups, with real codec and simulated vision.
- Existing discovery integration: all 44 behavior groups passed, including trials, review/repair failures, permissions, traversal and cancellation.
- New decision checks: 12 format/task routes, six stage-readiness cases, 21 trial collections and 12 publication cases, plus cancellation. Failed/unready artifact publication and JSON/XML delegation without a trial remain explicit.
- Six saved author cases retain outcomes: three bad Meetup candidates fail; two successful controls return three/one records; broad Comic Con candidate still mechanically returns 15 records. All model-visible structures agree with extraction. Zero forbidden/model requests. No new semantic verdict was requested.
- Four independent checkpoint roles completed with no material findings: Nisc alignment, generic grammar, execution/correctness and code quality. The grammar reviewer independently evaluated the before/after program with installed Prism across 768 contexts and found all eight affected top-level gates and complete final public outputs equal. The correctness reviewer independently reran focused image/decision tests; its animated-image coverage gap was then addressed with a direct two-frame GIF check. Documentation corrections were applied without another broad review.
- Required HTTP-only PDF regression passed after offline checks; no model capability was available. This is a transport/reader regression, not discovery accuracy.
- Engine diff: empty. Paid/model requests: zero.

Evidence: `data/runs/discovery-json-consolidation-2026-10-30/` contains the exact before/after JSON, rewrite counts, original/final offline logs, saved-case log and PDF result. The six-case detailed result is `data/runs/author-repair-offline-2026-10-30T13-23-55-474Z/summary.json`. Existing semantic failures and historical live measurements remain unchanged.
