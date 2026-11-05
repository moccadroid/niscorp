# Discovery boundary refactor — 3 November 2026

The engineering corrections pass offline verification. Model outcomes are mixed; this does **not** justify the wider 17 × 2 run yet. Python and Perl improve, SQLite remains unresolved, and both news controls lose useful information. The PDF contract regression found during the focused batch was corrected and its fresh model repeat succeeds.

## Scope and ownership

The user approved four changes after the regression investigation:

1. Preserve parsed DOCTYPE identifiers and document parsing mode when serializing prepared HTML. Keep the independent round-trip integrity check.
2. Let task declaration alone choose the processing flow. Source authors emit only its resource-reference path. JSON binds it to that declared flow, or returns local feedback; it never constructs `flow:null`.
3. Keep the increased native HTML allowances and preserve classes, metadata and structural evidence. JSON controls oversized-source manifests and the existing bounded source inspection. No prefix sampling or hidden allowance renewal.
4. Flatten traversal selections through the existing `output-source` JSON helper. The writer and emitted artifact use exactly the same projection. Every record has source/base/encoding provenance; strict HTML selection records and strict synthetic reference records retain their respective native values. Standalone JSON/XML inputs and previously emitted artifacts remain unchanged.

The engine, model adapter, package manifest and lock are unchanged from the start of this slice (13 file hashes checked). Provider/settings remain Groq 120b, high reasoning, temperature 1, top-p 1 and emit. No dependency, native planner, database, site policy or runtime AI was introduced. Schemas remain mandatory; fields are dynamic.

Source ownership: reader structure serialization and integrity checks are TypeScript mechanics; `discovery.json` owns processing admission, response mode, inspection branches and prompts; `mechanical.json` owns the shared data projection. `blueprint.ts` derives its strict contracts. Original source captures remain unchanged.

## Offline verification

- `pnpm typecheck` and `pnpm check` pass after the record-contract correction.
- Fifteen HTML preparation groups cover legacy PUBLIC/SYSTEM declarations, explicitly empty system identifiers, ordinary HTML5 and malformed declarations. Parsing mode is checked, including text-only documents.
- Unsupported processing references receive local feedback before acquisition/processing; the author can correct the reference without changing task authority. Successful source trials do not consume rejection-feedback bytes.
- The actual discovery pipeline enforces the configured inspection cap on oversized sources. Inspection stays scoped to owned sources and retains existing cancellation/byte rules.
- Flat inputs preserve ordering, duplicates, dynamic fields, missing values and provenance. Negative controls reject incomplete HTML records, non-string references and unknown properties. Standalone JSON/XML helpers remain unchanged.
- All 17 historical source selectors retain their original match counts through preparation. Citation PDF metadata survives.
- All 31 previously published saved artifacts (29 suite artifacts plus Guardian/Spiegel) return exactly their saved execution results, with network/model effects disabled. This preserves existing behavior, including any previous semantic mistakes; it is not an accuracy score.
- The exact PDF graph and its three recorded real task/source proposals now reach mapping with one reference record and two HTML records. A controlled completion proves the corrected integration offline; it is explicitly separate from fresh model accuracy.
- Required live HTTP-only PDF regression passes. It uses no model and is separate from the saved-source discovery tests below.

Evidence: `data/runs/discovery-boundary-refactor-2026-11-03/`, including `check-reference.log`, `typecheck-reference.log`, `offline-saved-reviewed.json`, `after-hashes.json`, `reference-output-replay.json` and `live-pdf-reference.log`.

## Independent reviews

Four checkpoint roles finished at 9/10 for engineering alignment after corrections: Nisc ownership, execution/correctness, mapping contracts and code quality. These grades do not measure model accuracy.

The reviews identified two material edge defects and one simplification:

- Inspection count was read from the current frontier level even though the pipeline increments root state. It now reads the owning root counter; the actual-pipeline test proves the configured cap.
- An explicitly empty SYSTEM identifier in a legacy PUBLIC declaration could change document parsing mode. Serialization now compares the declaration with the same parser's mode, preserves the empty identifier when necessary, and checks mode during integrity verification.
- Processing permission logic was duplicated. One pure JSON value now supplies admission and feedback.

The initial mapping review missed a further material integration defect: XML/JSON reference traversal synthesizes `{reference}` items, while the new flat contract initially admitted only HTML reader items. The first paid PDF control caught it before mapping. The corrected strict union admits both actual producers and rejects malformed alternatives. The mapping reviewer independently rechecked this correction and acknowledged that its initial review should have blocked the test. The failed paid run remains recorded; it is not regraded.

## Focused fresh model tests

This is **complete discovery on saved source captures**, with fresh model answers for every job, followed by independent execution of published artifacts without AI. It is not fresh-web discovery. Requests and instructions were unchanged. No saved model answers, manual artifact corrections, live-page fallback or source substitution were permitted. Unknown capture URLs would fail explicitly; none occurred.

The initial six-case batch was frozen under `data/runs/boundary-focused-2026-11-03/`. Only the PDF control was repeated after correcting its strict record schema, under `data/runs/boundary-pdf-contract-2026-11-03/`. Production code/prompts stayed frozen within each run.

| Case | Independently checked outcome | Provider requests | Input tokens | Output tokens | Total seconds |
| --- | --- | ---: | ---: | ---: | ---: |
| Python | All 3 requested Windows installer URLs; no extras | 5 | 37,680 | 8,506 | 23.50 |
| Perl | All 9 requested books/links; two links remain relative | 5 | 30,893 | 10,876 | 30.53 |
| SQLite | No artifact; mapping recovery exhausted | 6 | 35,492 | 22,901 | 57.68 |
| Guardian | Bad output: 10 null headlines/descriptions and incorrectly constructed URLs | 9 | 38,304 | 19,922 | 54.01 |
| Spiegel | Partial output: 10 supported headline/link pairs, no descriptions; changed story selection | 6 | 135,649 | 11,032 | 35.29 |
| PDF, corrected repeat | One correct URL and one correct 2,215,244-byte PDF | 5 | 44,607 | 13,176 | 38.91 |

The original failed PDF control additionally cost **3 requests, 24,339 input / 7,133 output tokens and 19.04 seconds**. Including that failure, all seven discoveries cost **39 requests, 346,964 input / 93,546 output tokens**. All requests reported usage; there were **zero actual rate-limit waits**. The six-case batch took 225.83 seconds; its later separate PDF repeat took 38.91 seconds, excluding the investigation interval between them.

Published artifacts' independent saved-capture executions took Python 6.60 ms, Perl 11.39 ms, Guardian 55.54 ms, Spiegel 124.58 ms and corrected PDF 43.70 ms. Those figures exclude preparation and live HTTP, and establish mechanical execution only. Bad data can execute correctly. The PDF's acquired SHA-256 is `bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697`; final data contains its URL exactly once. Semantic review accepted the PDF.

Independent qualification is saved in `focused-qualification.json`; publication flags in runner summaries are not accuracy grades.

## What the remaining failures actually show

### SQLite

Selection finds the Linux archive label, but the captured source gives it `href="hp1.html"`. This exact placeholder already exists in the older successful selector benchmark. Matching the anchor does not establish a usable download address.

The new writer sees the flat records correctly. Its first program tries to resolve relative URLs using `$slice.end` as an expression, although Prism requires a literal number. Cortex returns that exact schema error. Both subsequent answers contain malformed JSON; Cortex returns the parse error and exhausts its three configured steps. No executable program reaches semantic review. Flattening did not fix general Prism authoring reliability or the source's placeholder URL.

### Guardian

The retained prepared page exceeds the inline allowance. The model inspects `main`, but its whole subtree exceeds the observation window, so it receives an explicit omission rather than truncated HTML. It then guesses obsolete `.fc-item` selectors, receives empty-selection feedback, and eventually inspects empty article-overlay anchors.

It selects those anchors and asks for descendant `h4` and `p` nodes that are not inside them. Permissive field bounds correctly return missing values. The writer copies those nulls and incorrectly concatenates `/europe` with root-relative URLs instead of resolving them. None of the ten returned URLs matches an actual resolved source anchor. This is unusable output, despite a working artifact.

### Spiegel

The model inspects the first five `article` subtrees, which belong to the latest-news area, then selects every `article`. It returns ten valid headline/link pairs but chooses a different set from the former main-news extraction: only four stories overlap. No descriptions survive; three of those shared stories demonstrably had descriptions in the previous extraction from the same captured page. The later schema/output jobs still consume 128,374 input tokens between them because the broad extraction includes 167 records.

### Both news reviews

Preserving classes/metadata increases prepared evidence. The reviewer still requires complete matching evidence, which exceeds the existing 524,288-byte model-request allowance for these two pages. Both reviews return explicit unavailable errors before a provider call; neither accepts the data, and no semantic feedback repair runs. This is an observable limitation, not an acceptance or an execution failure. No partial evidence was silently substituted.

## Assessment and next decision

Keep the deterministic serialization/authority corrections and strict shared projection. Flat input is adopted successfully in Python, Perl and the corrected PDF; one trial per case does not establish general reliability or isolate the effect of that change.

Do not proceed to the wider paid batch yet. The unresolved architectural boundary is **how a bounded model sees enough page context to select complete records, and how the existing reviewer can assess the same evidence within its bound**. The source author currently falls from full evidence to arbitrary model-chosen inspections; mandatory whole-page reviewer evidence can then become unavailable. Another prompt tweak or larger batch would not prove that boundary sound.

No additional context mechanism, automatic sampling, raised reviewer limit, model change or site-specific fix was implemented after these outcomes. News handling needs a separately explained generic decision before further implementation. SQLite's mapping recovery and script-generated download target remain independent limitations. Existing news artifacts continue to work; newly discovered news artifacts have regressed in this focused test.
