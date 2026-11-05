# Feedback retention and shared resource URLs

This slice fixes the two producer-to-consumer gaps identified in the saved PDF failure. Logic remains JSON; TypeScript changes attach derived boundary schemas. No engine, dependency, model setting, acquisition step, model step or reviewer was added.

## Source feedback

Source author feedback is `{failure,inspection}`. Consecutive inspections replace only `inspection`, preserving the latest exact mechanical rejection. A new failed candidate replaces `failure` and clears `inspection`. A passing candidate clears both; a new frontier starts empty. The successful XML reference-selection handoff still uses the separate reference-program feedback contract. Existing shared model/observation/input allowances remain in force.

Offline tests exercise actual `test-source`, `inspect-source` and `source-request` helpers, including the resulting author message. They cover repeated inspection, replacement, clearing, frontier reset and unchanged budgets. The existing full discovery condition-repair case now performs two inspections before its controlled correction and asserts both retained failure and latest observation in the next request.

## Acquired resource URL projection

The shared `output-source` JSON helper projects `resources.items[].source.url` into `data.resourceUrls`. It returns `[]` without acquired resources. These are final physical response URLs, not content identity or a claim that all requested files were found. Existing acquisition owns alias deduplication and caller bounds.

`assemble-state` uses this helper for authoring input; `bind-output` copies its entire flow and derived output contract into the finished artifact as `shaping-source`. No preview-only projection or native URL reconstruction exists. The caller schema and learned Prism program still own final `result.data`. Resources remain separately available outside that data. Standalone JSON/XML inputs remain unchanged.

The existing reviewer receives the same URLs and minimal recorded `resourceRedirects`: URL, HTTP status and Location values. JSON instructions distinguish transport evidence from relevance/content proof. Full headers and resource bodies are not included. Existing total input admission still applies; no sampling was introduced.

## Verification

| Check                             | Result                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                  | Passed                                                                                                      |
| `pnpm check`                      | Passed; full offline suite and 15 benchmark-support tests                                                   |
| Grounded discovery integration    | 14 groups passed                                                                                            |
| Grounded acquisition integration  | 15 groups passed, including source-feedback reset and shared resource projection                            |
| Focused feedback helpers          | 2 groups passed; no HTTP/model effects                                                                      |
| Source inspection controls        | 6 groups passed                                                                                             |
| Reviewer wire controls            | 8 scalar/container values preserved; exact resource context checked through local provider messages         |
| Resource replay                   | Changed, added and empty results passed without AI; redirect aliases fetch each final resource once per run |
| Invalid projection                | Malformed resource URL rejected by the shared output contract without HTTP/models                           |
| Four independent checkpoint roles | Nisc/contract alignment, generic grammar, correctness and quality: no material findings                     |

Isolated package consumption also passed: two historical artifacts, four recorded-response executions, zero model imports during execution, declarations checked and optional entries checked separately.

The original saved failure was replayed through the updated feedback/projection helpers, without models or HTTP. Its `INVALID_PRECONDITIONS` rejection remains offered after inspection. Its two source references lead to the one already-acquired final URL `https://arxiv.org/pdf/1706.03762v7`; `resourceUrls` offers that URL once. A mechanical program reading that field satisfies an array-of-URI/unique-items contract. This is helper evidence, **not** a model-authored repair or a successful rerun of the earlier discovery. The historical failed run stays failed.

Evidence:

- `data/runs/feedback-resource-offline-2026-11-01/proof.json`
- `data/runs/feedback-resource-offline-2026-11-01/unchanged.json`
- `data/runs/feedback-resource-offline-check.log`
- `data/runs/feedback-resource-live-pdf.log`
- `data/runs/feedback-resource-package-consumer.log`
- `data/runs/package-OvSaBl/verification.json`

The required live mechanical PDF check passed: RFC 9225, 116,547 bytes, `%PDF-1.5`, 1,883.59 ms execution and 34.10 ms preparation. This verifies HTTP/redirect/PDF mechanics only. Its captured report is under `data/runs/live-pdf-2026-11-01T23-00-07-268Z`.

All 11 engine files, model transport, discovery default profile and lockfile match the preceding frozen live snapshot by hash. No paid provider calls or tokens were used. Offline provider responses were controlled; improved 120b behavior and current live discovery accuracy remain untested.

The first package-verifier invocation omitted its required manifest and exited before doing package work. It is retained in `data/runs/feedback-resource-package-check.log`. The corrected invocation used the unchanged closing-slice recorded-artifact manifest and passed; archive SHA-256 is `3a45ff647c6c4da427af23c81ef66871dcceec37e4b384e6ea05f63dc39a4a40`. This package check is mechanical compatibility evidence, not fresh discovery evidence.
