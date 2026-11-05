# Optional image-choice recovery

`@niscorp/haptic/search/image-choice` connects the tested checkbox/image challenge stages to the existing search `recoverSearch` hook. It is discovery-only. Importing normal execution or the search entry does not load this adapter, an image codec or a browser.

`createImageChallengeRecovery({operations, limits, profile?, html?, prepareImages, decideImages, postForm})` asynchronously prepares one recovery operation. Pass that operation as `recoverSearch` to `createSearchOperations`. The `operations` supply existing `http.get` and `url.resolve`; `limits` are explicit engine limits. `html` uses the existing HTML reader profile/charset handling. The host owns the three additional effect adapters:

- `prepareImages(challenge, sources, signal)` prepares one image asset per original tile ID. Source images and their URLs remain unchanged.
- `decideImages(request, policy, signal)` sends the declared vision protocol and returns the provider body. The request includes all image assets once, the observed challenge instruction and one question per tile. No human labels are supplied.
- `postForm(form, transportPolicy, signal)` submits the original form fields and returns an exact HTTP-source response with redirects left visible.

All callbacks receive cancellation. The POST form is frozen before the host call, and the returned source must identify that same target URL. Record/audit adapters must retain original bodies before parsing and fail terminally when recording fails. The factory does not require storage or read credentials/environment variables.

`imageChoiceWorkflow` is ordinary stamped JSON. It reads the configured challenge, acquires images, prepares assets, requests/validates vision decisions, applies the profile's Prism selection, submits the source-owned controls, reads the server's success form, submits it and follows bounded POST-to-GET redirects. The existing search flow then admits a result or provider-reported empty page. A success form alone is not proof of search results. Repeated challenges or unknown pages remain failures at search admission.

`imageChoiceProfile` owns selectors, permitted origins, vision model/prompts/headers/threshold/Prism selection, transport allowances and continuation policy. The default describes the observed DuckDuckGo form. It does not contain a duck-specific classifier or a search instruction. The selected object comes from the captured form instruction. Supported continuation redirects are explicitly 301/302/303 followed by GET; preserving POST bodies across 307/308 is not offered.

The optional host connection used by `scripts/check-search.mjs` is in `scripts/search-image-adapters.mjs`. It loads recovery and the optional ImageScript preparation entry only when the existing hook is invoked, uses the explicit TypeSafe vision wire adapter because installed Signal does not forward image assets, and submits forms through native Node HTTP like the existing GET adapter. These are host choices, not core dependencies. Another host can supply another codec/compatible vision transport/form adapter through the same contract. No session framework, browser or plugin manager was added.

## Optional image codec

Install the optional `imagescript` peer to use `@niscorp/haptic/search/image-choice/imagescript`. Core execution, search and the image-choice recovery entry do not import it. Only the explicit codec entry requires ImageScript; the live runner dynamically imports it upon recovery. The package provides `createImageScriptPreparer(profile?)`, `ImageScriptProfileSchema` and `imageScriptProfile`.

```ts
import { createImageScriptPreparer } from '@niscorp/haptic/search/image-choice/imagescript';

const prepareImages = createImageScriptPreparer();
// Inject prepareImages alongside the host's decideImages and postForm callbacks.
```

The separate `imagescript-profile.json` owns minimum width/height, background, input/output byte/pixel allowances and PNG encoding settings. Defaults use centered white padding to reach at least 280-by-280, without resizing. Larger images retain their dimensions. Source RGBA pixels, including transparency, are copied unchanged into the padded canvas. Encoding metadata is fixed by JSON so repeated preparation produces the same bytes. Single-image inputs become PNG assets keyed by original tile ID. URL/order/status, body integrity and unique IDs are checked. Multi-frame images and exceeded allowances fail explicitly. The adapter owns its settings and inputs before asynchronous work. Cancellation is checked around decoder/encoder awaits and before returning assets; synchronous codec work is not interrupted mid-call.

There are no shell calls, native binaries, runtime subdependencies, temporary-file requirements, working-directory assumptions or benchmark imports in this adapter. Maintained offline codec and recovery tests consume the same exported preparer. The one-off research preparer and its wrappers are retired. The retired Sharp entry/profile/dependency was removed without aliases; its historical measurements remain historical. See [ImageScript integration verification](../measurements/imagescript-integration-2026-10-30.md).

`node scripts/check-search.mjs "<instruction>"` always uses live sources and rejects a saved-page argument. Captures, original images, prepared assets, raw provider bodies, form exchanges, recovery outcomes, artifacts and separate fresh AI-free execution are retained under ignored `data/runs`. TypeSafe/Groq keys come from the host; they are not published in artifacts or evidence request headers.

See [fresh connected results](../measurements/search-image-choice-connected-2026-10-30.md). This establishes one fresh recovered search and partial destination extraction, not universal CAPTCHA reliability or complete query answers.
