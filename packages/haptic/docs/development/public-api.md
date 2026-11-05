# Public contract

Haptic is an unreleased headless ESM TypeScript library. Its package/import name is `@niscorp/haptic`; it remains private until its first release. The library does not schedule checks, send notifications or persist results.

## Entries and dependencies

| Entry                                       | Responsibility                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@niscorp/haptic`                                 | Artifact schemas, Strata stamps, preparation, execution and errors                   |
| `@niscorp/haptic/operations`                      | Mechanical HTTP/HTML/JSON/XML/URL operations and profiles                            |
| `@niscorp/haptic/discovery`                       | JSON discovery workflow, profile, typed authoring/preparation boundaries and factory |
| `@niscorp/haptic/search`                          | First-page search, source ordering and ordinary destination discovery                |
| `@niscorp/haptic/search/image-choice`             | Optional discovery-only recovery with injected image/vision/form effects             |
| `@niscorp/haptic/search/image-choice/imagescript` | Optional image preparer requiring the ImageScript peer                               |

Zod is required. Cortex, Signal and the provider SDK are optional discovery peers; ordinary execution does not import them. The Groq/OpenAI-compatible transport uses OpenAI's SDK. Other Signal adapters require their own SDKs. Ordinary search/recovery contracts load no image codec; only the explicit ImageScript entry does.

## Discovery input

```text
{url,instruction,asOf?,allowLinkFollowing?,linkDepth?,maxPages?,
 allowResourceFetching?,maxResources?,outputSchema?}
```

Permissions default to false. The unchanged instruction cannot increase them or their ceilings. Explicit caller false/zero overrides are preserved. `asOf` is optional caller time for interpreting the instruction; it creates no additional restriction or native clock.

`outputSchema` is an object-form JSON Schema for final `data`, with dynamic fields and types. It is admitted unchanged before model or HTTP effects. Without one, a separate ordinary-schema author runs after source extraction. Invalid generated declarations can receive compilation feedback; once admitted, the schema is fixed for that shaping pass. A review-driven correction may reauthor an automatic schema; caller schemas never change. Task declaration remains only `{requiresNavigation,resultFlow}`.

Prepare `discoveryWorkflow` with `createDiscoveryOperations(...).operations` and its returned limits, then run the request. Reuse that prepared workflow for later requests with the same registry/profile; compilation is setup, while each request retains its own admission and allowances. The fixed JSON pipeline owns task declaration, acquisition/traversal, format-specific source authoring, schema admission, bare Prism authoring, final-data review with bounded feedback and the fresh complete mechanical trial. See [the builder](discovery-builder.md).

The default output-mapping job uses `profile.outputSettings:{reasoningEffort:"low"}` merged over `profile.settings` by JSON. Other jobs retain the base settings. Hosts can override the output job with a partial settings object, including `{reasoningEffort:"high"}`. An omitted member or `{}` inherits the base settings, preserving older supplied profiles. For output mapping, `maxSteps`, `outputAttempts` and `maxMs` are per-invocation ceilings: JSON takes the tighter of these settings and the existing phase/remaining allowances. They cannot extend the shared budget, and a mechanical retry does not renew it. This changes discovery authoring only; emitted artifacts contain no model calls.

A completed engine run does not necessarily publish an artifact:

| Discovery field | Meaning                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `status`        | `ready` after mechanical publication; `blocked` for exhausted provider rate limits; otherwise `unresolved` |
| `blocked`       | Structured provider `{kind,code,message,status,retryAfterMs}` facts, or null                               |
| `artifact`      | Admitted reusable artifact, or null                                                                        |
| `reason`        | Concrete unresolved reason or known scope note, or null                                                    |
| `outputSchema`  | Effective admitted result schema, or null                                                                  |
| `trial`         | Separate fresh complete mechanical outcome, or null when not reached                                       |
| `partialTrial`  | Last completed captured whole-bundle `{outputSchema,outcome}`, or null; diagnostic only                    |

`review` is null when unavailable, otherwise the typed reviewer result: `ok`, `decision:{accepted,reason}|null`, and any error/usage details. `repair` contains `{attempts,reason}`; its reason reports a failed correction when a previous working artifact is retained. These fields describe the returned artifact, not a discarded correction. A ready artifact can have a negative or unavailable review. Callers may require `review?.decision?.accepted === true`, but Haptic does not impose that filter. The remaining public fields are `policy`, `task`, `limited` and `author:{remaining,attempt}`. These are diagnostics, not additional acceptance gates. Private levels, source bodies, model transcripts and raw generations are excluded from this strict result contract. Successful intermediate candidates and partial trials are not executable published artifacts. No manual approval is required to complete discovery.

## Model and repair boundaries

Provider rate limits never become semantic rejections. If quota blocks review or correction, a preceding working artifact still receives fresh mechanical verification and returns as `ready`, with `blocked` reporting the provider problem. Without a working artifact, quota exhaustion returns `blocked` and a null artifact. This is not an extraction-quality verdict.

`profile.modelTransport` owns OpenAI-compatible SDK retry policy. Defaults are `openaiCompatible.maxRetries:5` (six transmissions including the original) and `rateLimit:{statuses:[429],fallbackWaitMs:1000,code:"PROVIDER_RATE_LIMITED",message:...}`. The SDK is the sole HTTP retry loop. After an actual configured response, its original `retry-after-ms`, then `Retry-After` seconds/date, then the fallback determines a cancellable cooldown before retransmission. The pending request, history and owned page remain unchanged. There is no preemptive quota delay or new model allowance. Cooldowns are shared only by calls using the same factory client/model, not by independent factories, processes or other organization jobs. Other Signal adapters retain their own SDK retry behavior.

An owned model-call deadline ends that job with `MODEL_TIME_LIMIT`, or structured provider facts if it expired waiting on a known rate limit. JSON chooses the subsequent outcome and can retain an existing working artifact. Caller cancellation and the whole-run deadline remain terminal; neither grants a retry or permits late publication. A blocked attempt is not a persisted resumable run.

HTML/XML source authors receive current-frontier evidence and return source-only inspection or their offered component candidate. JSON trials candidates and automatically commits mechanical success. Identified mechanical failures can narrow source correction. Source inspection cannot fetch URLs, change arbitrary components or publish.

Reference and output authors emit bare Prism programs. Output sees actual native extraction and the fixed result contract. Mapping failures receive mechanical feedback within the current attempt's author allowance. The program cannot alter schemas, task or acquisition ceilings.

One reviewer definition sees actual shaped data separately from the result schema, plus matching original-format evidence and real traversal scope. It emits `{accepted,reason}`. A negative verdict can trigger the configured bounded repeat of the fixed author pipeline, with each job receiving its own proposal/observation history and the review feedback. Working artifacts are returned independently of that verdict; callers receive the review separately. Fresh complete mechanical verification remains required.

Default JSON policy gives each attempt 12 author model steps/300000 ms and four reviewer steps/60000 ms. Local calls and Cortex recovery share the current attempt's allowance; per-call response recovery is capped at three and the remaining allowance. `review.maxRepairs:1` permits one correction pass; zero disables that pass without making semantic rejection a publication gate. Phase changes and local mechanical retries do not reset allowances. A new review-driven attempt receives fresh configured author and reviewer allowances, even if the preceding attempt exhausted them. `author.attempt` identifies the attempt whose remaining allowance is shown. The default whole-run engine cap is 780000 ms (13 minutes); an explicitly tighter host cap or cancellation still wins. Repair reuses owned captures and whole-discovery acquisition charges. It repeats source jobs and dependent schema/mapping work in fixed order, even for a mapping-only defect; it does not ask a model to route repairs. Own-job histories preserve prior JSON proposals, mechanical observations and delivered review feedback, without repeating source bodies or other agents' prompts. `observations.maxBytes:262144` bounds one observation; `maxInputBytes:524288` bounds assembled requests. Bytes are not token/context guarantees. Provider retry attempts and actual rate-limit waits are reported separately; no preemptive quota reservations are used.

## Execute a returned artifact

Prepare it once with the mechanical registry from `createWebOperations`, then run `{url}` repeatedly. Current values and links are read through the saved rules and Prism. No instruction, model credential or AI capability is needed.

| Artifact                         | Result                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Discovered HTML/JSON/XML         | `{data,visited,limited,redirects}`                                             |
| Low-level native HTML extraction | Intermediate `{pages,visited,limited,redirects}`                               |
| Declared resource fetching       | Adds `resources:{items,visited,redirects,limited}` with bounded bytes/metadata |

Native HTML fields have arbitrary names and arrays of strings/null. Empty arrays mean no selected elements; `[null]` means a selected element lacked the requested attribute. Bounds count elements; Prism and the data schema own conversions and value constraints.

Visited lists acquired targets, starting URL included. Redirect hops do not spend additional target slots; distinct aliases can spend slots before their common final document is known. That document is fetched/extracted once. Limitation flags are mechanical, not completeness guarantees. Empty selections create no result page.

Discovery and final verification are separate runs. Public page/resource ceilings are not one aggregate HTTP-request cap spanning both. Charged discovery captures/aliases remain owned through local mechanical retries.

Both factories own their default HTTP resources: call `close()` in finally blocks. Both accept `mechanical?: Operations` for host-supplied generic operations. Overrides are captured once and the same registry is used for acquisition, artifact preparation and captured/fresh trials. The host owns injected callbacks and their resources; factory `close()` closes only its own transport. Pass a signal to `prepared.run` for cancellation. Closing a factory is cleanup, not the cancellation API. Run input/settings are owned before asynchronous work; cancellation/deadlines prevent late publication.

Custom discovery profiles must include the `outputRejections` array of structured provider `{code,status,evidence}` rules. The shipped rule recognises `output_parse_failed`/400. A shared Prism projection selects the correction evidence; the model adapter translates a match into Signal's failed-output result. Cortex requests another answer in the same conversation under the existing step/time caps, and JSON charges that complete run to its original owner allowance. No second retry loop or budget reset occurs. `outputRejections:[]` disables adaptation. Rejected generation text is diagnostic only; it cannot become answer data or model instructions. Usage remains explicitly unreported for a rejected or terminally failed call without provider usage. Previously measured calls remain in the totals; an unknown contribution is never presented as a measured zero. Unknown/authentication errors remain failures, cancellation stays terminal, and HTTP429 waits/retries remain transport-owned. Finished artifact execution is unchanged.

The mechanical web profile has `requestHeaders`, defaulted from JSON to `{"user-agent":"Haptic/0.0.0"}`. It applies to website acquisition in both discovery and artifact execution. Explicit `http.get` input headers override defaults by case-insensitive name while preserving unrelated defaults. Configure host headers through `createWebOperations({requestHeaders:...})` or discovery's `web` option; `{requestHeaders:{}}` disables the defaults. Custom host settings remain host-owned and are not copied into model context or emitted artifacts. Use the same host settings for execution when a target requires them. This setting does not affect model-provider requests or change engine grammar.

## Admission and failures

Structural schema parsing is not full executable admission. `prepareArtifact` admits Strata stamps, all helper/operation references and flow schemas, then compiles Prism, including inactive steps and unused helpers. Emitted artifacts carry their own boundary schemas and require no discovery lookup during execution.

There is no universal error envelope:

| Observation                            | Meaning                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Failed engine outcome                  | Operation/check failure; read its existing code/message, with no successful value                   |
| Rejected preparation/run promise       | Invalid contracts/expressions/values, integrity/cancellation/resource controls or unexpected errors |
| Completed discovery with null artifact | No admissible artifact within policy; inspect reason and diagnostic partial trial                   |
| HTTP challenge/rejection               | Acquisition failure, not proof that requested information is absent                                 |
| Valid empty execution                  | Allowed by checks/schema; not proof of semantic absence                                             |
| Missing learned stage                  | Discovery/maintenance required before that frontier; execution never calls AI                       |

Declared checks and the fallible reviewer cannot detect every wrong or missing result. The saved Steam unrelated-offer and 7-Zip frozen-version failures remain counterexamples. Publication is observed acceptance, not certification of completeness, fresh-value meaning or universal reuse.

## Supported scope and evidence

Supported source formats are configured HTML/JSON/XML media types. One format is allowed per frontier. Arbitrary terminal JSON/XML data leaves within reference traversal, XML xml:base, recursive HTML child records, plain-text discovery, browser interaction, alternate-API discovery, downloaded-content extraction and automatic maintenance remain unavailable. Optional search CAPTCHA recovery is explicitly injected, not a default general solver.

The first release has an explicitly best-effort discovery contract. A working artifact and its advisory verdict are returned automatically; manual approval is not required. Model review can accept wrong results, and current checks do not certify future completeness or universal reuse. Earlier failed-controller results, historical grades and package checks do not establish a new accuracy score. See the [fixed finish line](remaining-work.md), [reference limits](reference-following.md) and [search](search.md).

HTML profile boundaries: native defaults allow 2 MiB decoded HTML and 20,000 elements. Discovery retains semantic attributes and metadata while clearing configured executable/style payloads. `htmlContext.maxInlineBytes:262144` owns the total inlined HTML frontier allowance. Larger frontiers expose actual HTML views with explicit omissions and continuation; authors and reviewers can inspect owned captures further; `maxInputBytes:524288` still bounds complete model requests. New HTML shaping inputs use flat `records` with per-record source/base/encoding; public request/result shapes and standalone JSON/XML native inputs remain unchanged.

The `@niscorp/haptic/migrations` entry exposes `ENGINE_SEQUENCE` and `ENGINE_SCHEMAS` for Strata grammar composition. See [DOCS](../../DOCS.md).
