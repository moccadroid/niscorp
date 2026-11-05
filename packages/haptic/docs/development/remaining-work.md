# Current limits and completion work

The current implementation is a fixed, job-specific JSON discovery pipeline. Its predecessor, the universal author controller, failed its adoption comparison and was removed. Original reports, provider bodies and failed trials remain historical evidence. The agreed first release is best effort: working artifacts return automatically with a separate advisory review. Perfect discovery, another model experiment and a higher reviewer grade are not release gates.

## Supported behavior

- Request plus URL and an optional dynamic output schema can produce a reusable mechanical artifact.
- HTML uses CSS and record-scoped fields, JSON remains native, and XML uses URI-bound XPath. Prism owns conversion and shaping.
- Navigation and resources use existing BFS/redirect/alias helpers under explicit caller ceilings. Returned resource bytes stay outside data; contents are not extracted.
- Search reads the first DuckDuckGo page, orders candidate metadata with 120b, visits a bounded source list and invokes ordinary discovery per destination. Search acquisition consumes none of destination depth/page allowance.
- Optional image-choice recovery uses injected codec/Jev/form effects. Ordinary execution/search has no browser or codec dependency.

Source authors inspect only current-frontier evidence. HTML authors propose the whole source rule; XML retains its format-specific contracts. Mechanical trials commit successful proposals automatically. Task/schema/mapping admission can receive bounded mechanical feedback. The admitted result schema remains fixed within a shaping pass; only an automatically generated schema may be reauthored in a review-driven repeat. Review feedback permits a bounded repeat of the same fixed author pipeline with own-job histories and unchanged allowances. Mechanically verified artifacts return `ready` with an independent verdict, including negative or unavailable review; callers decide whether that verdict matters.

The [current status](current-status.md) owns the latest engineering and semantic evidence. Dated measurements remain history; this work list does not supply a separate accuracy or release claim.

## Fixed finish line

1. **Close concrete engineering findings here.** Keep verification self-contained, correct stale documentation and run `pnpm typecheck`, `pnpm check`, `pnpm run check:package` and the HTTP-only PDF regression. The package check uses repository fixtures by default; no private research directory or model credential is required.
2. **Freeze the handoff.** Record the final source revision, verification results and tested runtime. Retain the [accepted limitations](limitations.md), including the Steam wrong-offer and 7-Zip frozen-version counterexamples. The original source checkpoint is preserved in Eden-next; Haptic is now integrated as private `@niscorp/haptic`.
3. **Integrate and verify after authorization.** Follow the [handoff contract](nisc-handoff.md): adopt the real package identity and Nisc workspace/release configuration, then run the existing checks and isolated package-consumer verification in the destination. Publication is a separate release action.

The finish line is a clean destination checkout that builds and passes those checks, plus an independent consumer that imports the package and executes its artifacts without AI. The authorized Nisc move is recorded in [Nisc integration](nisc-integration.md); npm publication is separate. New paid batches, prompt changes, browser support and perfect semantic results are outside this closing work.

## Accepted limitations

Source selection, generated schemas, Prism and review can make wrong assumptions, including duplicate or missing results. Schemas and checks do not detect every semantic error. Mixed-format frontiers, terminal JSON/XML data leaves during reference traversal, XML xml:base and recursive HTML child records remain unsupported. No silent sampling, source batching or heterogeneous-layout routing is provided.

HTTP challenges are acquisition failures, not empty data. Plain HTTP Google searches returned JavaScript challenges on the tested connection. A Fandom API route returned content in a diagnostic; automatic alternate-endpoint discovery is not supplied. These boundaries remain documented rather than becoming new release requirements.

## Deferred capabilities

Browser interaction, general CAPTCHA handling, plain-text discovery, downloaded-content extraction, automatic alternate APIs, automatic maintenance and a scheduler/notification framework are separate work. The library supplies internet acquisition and reusable extraction artifacts; callers own periodic execution and downstream actions.

## Evidence boundary

Offline protocol/mechanical tests, recorded-source model discovery, fresh-web discovery, captured/fresh AI-free execution and changed-source reuse are distinct. Preserve historical scores; do not silently regrade them under new contracts. Unknown provider usage remains unknown. Actual rate-limit waits belong in reported time, not preemptive reservations.

The previous failed experiment is recorded under `docs/measurements/source-grounded-discovery-2026-11-01.md`. Its failed gate remains failed. Current implementation contracts are in [the builder](discovery-builder.md), [result shaping](output-shaping.md) and [the approved job-specific design](../plans/job-specific-discovery.md).
