# Jev image-choice challenge research — 2026-10-29

> Tooling retirement, 2026-11-01: commands and runner paths below describe this historical experiment. The one-off saved-authoring/navigation/CAPTCHA research drivers were removed during handoff cleanup; original captures, failed results and archived tool snapshots remain in ignored evidence. Current offline contracts are tested through the maintained `tests` suite. Optional codec use is documented in the current image-choice contract; historical Sharp instructions are not current setup instructions.

## Outcome

Jev identified the three ducks among nine real DuckDuckGo challenge images. All three requests classified every tile correctly. Both unmodified form submissions were accepted by DuckDuckGo's live endpoint, which returned `#success-form` and “Thanks for confirming you’re human!”. Both continuations reached ten actual search results through HTTP POST, a 302 redirect and existing native HTTP GET. No browser or page JavaScript was executed.

| Fresh Jev call | Correct tiles | Input tokens | Output tokens | Wall time |
| --- | ---: | ---: | ---: | ---: |
| Initial research 1 | 9/9 | 3,810 | 157 | 664 ms |
| Initial research 2, identical input | 9/9 | 3,810 | 157 | 723 ms |
| Extracted module | 9/9 | 3,801 | 157 | 725 ms |
| Total | 27/27 | 11,421 | 471 | 2.112 s |

These are **nine unique images**, not 27 different images or three independent challenges. The model resolved to `jev-1.14.0`. Image input, question text and threshold were not manually corrected. Provider bodies were saved before parsing. Human labels were frozen before paid requests and never sent to Jev. Nine images were included together per request, each referenced once in shared state. The question IDs and object names were not used to pre-label relevance.

Duck tiles were `tile1`, `tile3`, `tile5`, each returned at 0.99 in all three calls; other tiles were between 0.02 and 0.04. The threshold was 0.5. The actual object to select came from the captured instruction, not native code. No bounding boxes were necessary because the HTML already identifies individual image/checkbox pairs.

## Limits of the evidence

- Four current acquisitions returned ordinary pages, so this test used a previously captured **real** challenge and newly downloaded original image files. Submission and continuation were live. We did not demonstrate recovery of a newly blocked browser/session. The older challenge was still accepted by the server.
- The first acquisition script incorrectly asserted that a challenge must exist; ordinary HTTP 200 results caused that attempt to fail. The evidence remains under `data/runs/jev-captcha-2026-10-29`. Recognition now returns null for ordinary pages; four actual ordinary responses pass that skip path.
- Only the observed checkbox-image challenge and its success form were tested. No reCAPTCHA, hCaptcha, rotating grids, audio, cookies/session rotation, or browser interactions were implemented or validated.
- This is not a production-reliability or cross-provider CAPTCHA accuracy claim. Jev's image API remains experimental.

## Isolated module and ownership

Everything is under `benchmarks/captcha-evaluation`; nothing was added to `src`, root package exports, normal discovery, engine, dependencies or the normal check command.

- `challenge-reader.mjs` recognizes a profile-described form mechanically. `loadImageChallengeModule` dynamically imports `image-choice.mjs` **only after** recognition; ordinary pages return null first.
- `image-choice.mjs` builds the documented vision request, validates complete responses, uses Prism with the JSON selection rule and constructs original HTML form fields from selected IDs. It owns no HTTP client, credentials, image codec, retry loop, session or persistence.
- `profile.json` owns selectors, permitted origins, model, prompts, repetition count, probability threshold, Prism selection and the narrow research continuation allowance. It contains no answer labels or object-specific selection code.
- `acquire.mjs`, `classify.mjs`, `submit.mjs` and `continue.mjs` are explicit **research drivers**, not Haptic workflows. They preserve original HTTP/model evidence. `classify.mjs` exercises the conditional module loader; `submit.mjs` uses the module's generated fields.
- `prepare-images.ps1` is a Windows-only research preparation tool. Four images needed white padding to reach the API's minimum dimensions. Originals remain unchanged. This helper is not a proposed library dependency or production image adapter.

Installed Signal 0.1.4 does not forward `assets`, offer Box questions or expose the required image opt-in header. Research therefore calls the documented vendor protocol directly. It does not patch Signal or add a hidden HTTP workaround to Haptic. Before production adoption, vision transport belongs in Signal or an explicitly supplied compatible adapter; image preparation belongs to an optional host-provided codec. Search/discovery orchestration is still separate future work.

## Verification and reproduction

`node --test benchmarks/captcha-evaluation/image-choice.test.mjs` runs eight offline checks: ordinary-page skip, variable choice counts, malformed/ambiguous forms, origin bounds, dynamic instructions and single asset references, missing images, incomplete/invalid model responses, and configurable Prism selection with source-owned form fields. Two original recorded responses also replay through the extracted module unchanged.

Research stages are separate commands: `acquire.mjs <directory> [pageUrl] [savedHtml]`, `prepare-images.ps1 -Directory <directory>`, `classify.mjs <directory> [profileFile]`, `submit.mjs <directory>`, and `continue.mjs <directory>`. Model calls and form submissions are explicit, not part of offline checks. A human judgment file is required for evaluation. New run directories are required to retain prior request/response evidence.

Update 2026-10-30: the PowerShell command above describes the historical run only. That implementation was removed. After building, use `node benchmarks/captcha-evaluation/prepare-images.mjs <directory>` with the optional Sharp peer; this research command consumes the library's exported preparer. Historical images, responses and scores remain unchanged. Current adapter verification is [separate](captcha-codec-discovery-consolidation-2026-10-30.md).

Evidence: `data/runs/jev-captcha-2026-10-29-saved` and `data/runs/jev-captcha-2026-10-29-module`. Exact requests, raw responses, original/prepared images, frozen labels, HTTP forms, server confirmation and final results remain there. `verification.json` in the module directory summarizes combined coverage and limits.

Primary documentation checked: [TypeSafe images](https://docs.typesafe.ai/images), [Noul](https://docs.typesafe.ai/primitives/noul), [Box](https://docs.typesafe.ai/primitives/box). Image assets use UUID references, PNG/JPEG data and the `TypeSafe-Danger-Zone-Images: true` header. The documented minimum is 280 pixels on each side. Box returns one rectangle and is unnecessary for this form.
