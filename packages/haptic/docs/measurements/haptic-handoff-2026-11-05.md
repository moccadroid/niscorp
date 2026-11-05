# Haptic final engineering handoff — 5 November 2026

The implementation checkpoint is `37527db8c3bff85848b7d4372f2ca66e072b6b4f` on `codex/clean-discovery-checkpoint`. This document and the final handoff notes are a subsequent documentation checkpoint. Haptic remains the private staging package `eden-next@0.0.0`; nothing has been moved, linked, pushed or published to Nisc.

## Contract being handed over

Request + URL + optional output schema enters discovery. Discovery authors a reusable JSON artifact through the fixed JSON pipeline. The in-memory engine executes that artifact mechanically against current sources. No model credentials, model operations, database or mandatory persistence are required by finished execution.

Workflow choices, prompts, model settings, permissions, thresholds and repair policy are JSON data. TypeScript implements the interpreter, schema admission and generic protocol/parser/adapter mechanics. The actual published Prism mapping agent owns all mappings; Cortex/Signal own model-output recovery and Strata owns artifact grammar stamps. The stored `eden.engine` identity is not a package-name placeholder and must survive a package rename.

The source-ownership refactor gives a source job one current level and a materialized frontier. Its only outputs are `level`, `part`, `feedback`, `allowance`, `histories` and `reason`. Traversal owns acquisition and the global level list, with only the author allowance. Root owns final output, reviewer allowance, review and the last working bundle. Closed helpers reject unrelated state before effects. No replacement controller, grammar or native planning policy was added.

## Frozen verification

The final implementation was copied to a fresh temporary directory without credentials, installed dependencies, Git metadata or historical run directories. Dependencies were installed from the cached locked graph. All checks passed on **Node v24.13.1**:

| Check                        | Observed result                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| TypeScript and build         | Passed                                                                               |
| Offline suite                | 57 modules passed                                                                    |
| Benchmark-contract checks    | 33 passed                                                                            |
| Independent package consumer | All three installation/import/declaration phases passed                              |
| Saved packaged artifacts     | Two artifacts executed twice each, with zero model imports                           |
| Optional dependency boundary | Model/codec peers absent during core execution; installed explicitly in later phases |
| Live HTTP-only PDF control   | Correct 116,547-byte PDF downloaded; zero model calls                                |
| Public-pipeline preservation | All 787 recorded events identical before/after                                       |

The preservation trace contains 95 complete public outcomes, 447 controlled model-operation inputs and 245 top-registry HTTP-operation inputs. Model message strings and settings match exactly; published artifacts are part of the compared public outcomes. The trace SHA-256 is `c5928be34209e753d2a565e5903aae6e1388dad69bcdf109aa7dbf62f840ec24` on both sides. These use fixed test replies and unchanged original assertions, not fresh paid models or a new accuracy benchmark. Nested mechanical HTTP behavior is additionally protected by the original test assertions.

All eleven engine files, model adapters, model defaults and dependencies stayed unchanged during the source-ownership refactor. The raw verification, baselines, failures, reviews and final implementation archive remain protected under `data/runs/source-ownership-refactor-2026-11-05/`. The public package and normal offline/package checks do not depend on that directory.

Discovery-workflow preparation measured 733.10 ms before and 808.82 ms after: two warmups and six interleaved samples per implementation in one process. This measures admission/compilation of the discovery workflow, without HTTP or models. The executable discovery document grew from 869,085 to 936,558 bytes as its contracts became explicit. Finished engine files and generated artifact contents are unchanged; this measurement does not time finished extraction or fresh model discovery.

## Independent engineering reviews

The main implementation and its final grades came from different agents. The architecture/Nisc reviewer made no source changes. The quality reviewer edited one capture test and ownership documentation; the execution reviewer removed four proven-unused alias steps. Those contributions were cross-checked through the other reviews, boundary controls, exact trace comparison and the final clean-copy run. They are not presented as fully separate authorship for every line.

| Original code-quality category     | Final assessment |
| ---------------------------------- | ---------------: |
| Engine                             |                9 |
| Transport/readers                  |                9 |
| Discovery TypeScript               |              9.5 |
| Discovery JSON                     |                9 |
| Search                             |                9 |
| Mechanical tests                   |                9 |
| Accuracy verification/current docs |                9 |
| Integration/extensibility          |              9.5 |
| Overall                            |                9 |

| Original Nisc category | Final assessment |
| ---------------------- | ---------------: |
| Artifact execution     |                9 |
| Prism/Strata           |              9.5 |
| Cortex/Signal          |              9.5 |
| Discovery simplicity   |                9 |
| Extensibility          |                9 |
| Documentation/evidence |                9 |
| Overall                |              9.5 |

Engineering architecture was assessed at 9. These are subjective engineering judgments, not percentages, averages or accuracy measurements. Earlier grades had improperly included model success and missing new platform/capability evidence in engineering rows. Reassessment of unchanged components is identified as a grading correction, not newly implemented improvement. The code-quality reviewer subsequently clarified that 9 versus 9.5 did not represent a specific remaining defect or required work. No confirmed actionable engineering finding remained open at closure.

The historical broad-unattended-readiness assessment remains 4.5 because semantic evidence was not changed or regraded. It is separate from engineering quality and is not a new release gate for the accepted best-effort library.

## Accepted limits

- Discovery can return no artifact, or a working artifact with incomplete or incorrect data. `ready` guarantees fresh mechanical verification; review remains advisory. Schema validity and positive model review do not guarantee meaning, completeness or future reuse. The saved Steam wrong-offer and 7-Zip frozen-version cases remain counterexamples.
- HTML, native JSON and original XML/XPath are supported within documented format/frontier limits. Mixed-format frontiers, terminal JSON/XML data inside reference traversal, XML `xml:base` and recursive HTML child records remain unsupported.
- HTTP/HTTPS GET is the supplied acquisition basis. Browser interaction, general login/session automation, plain-text discovery, downloaded-content extraction, automatic alternate APIs and automatic maintenance remain deferred. Scheduling and notifications belong to callers.
- Search uses the first DuckDuckGo result page, configured ordering/rewrite limits and ordinary destination discovery. Optional image-choice recovery is injected; live search/CAPTCHA reliability is not universally established.
- The package is ESM. The manifest declares Node `>=22.13.0`; actual verification above used Node 24.13.1, without claiming a tested runtime matrix or CommonJS support.

See [the full limitations](../development/limitations.md), [public API](../development/public-api.md) and [handoff procedure](../development/nisc-handoff.md). No further experiment, prompt tweak, model change or perfect-discovery requirement is part of this handoff.
