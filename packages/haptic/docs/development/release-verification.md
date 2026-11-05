# Release cleanup and verification — 2026-10-29

For current engineering verification, semantic outcomes and release limitations, read [current status](current-status.md) and [Nisc handoff](nisc-handoff.md). The current package check is `pnpm run check:package`, using repository fixtures by default. The dated cleanup, commands, package and model scores below remain historical evidence, not a current release certificate or additional release requirements.

Historical staging note, 2026-11-01: Haptic is the chosen library name; the private package identity/move/publication are still pending. Final handoff cleanup and offline consumption checks are documented in [nisc-handoff.md](nisc-handoff.md), with the complete [current limitations](limitations.md). The scores and commands below remain dated historical evidence, not a new accuracy result or instruction to run paid batches during handoff.

Cleanup and package preparation are complete. The initial full-batch results below measure imperfect discovery; they do not establish universal accuracy or reuse. The user accepted those limits and approved the focused closing correction recorded at the end of this document. No engine files changed, no new runtime framework was added, and no Nisc workspace files were changed. Name, move and publication remain pending.

## Cleanup and checkpoint

- Removed the internal-only `htmlReview` and `taskDeclaration` public exports; tests import the owning JSON directly. No compatibility aliases.
- Consolidated stale instructions into current AGENTS guidance; the prior file remains in verification evidence. Historical source/trial evidence and credentials remain intact.
- Added public API/failure documentation, Nisc handoff instructions, Apache license and package metadata. Runtime/operations and optional discovery peers remain separate. Exact tested dependency versions remain locked; no workspace links.
- Packed and installed the library outside the checkout. Verified a real returned artifact with model imports blocked, TypeScript declarations and discovery import without provider calls. Public runtime entry needs no model credentials.
- Nisc review 9/10; generic grammar 9/10; execution 8.5/10; code quality initially 8/10, then 9/10 after its focused resource-control recheck. These are engineering reviews, not discovery accuracy scores.
- Fixed review findings: shipped documentation links; missing expected reference acquisitions previously becoming ungraded; XML field-output amplification; subprocess logs resolving before stream closure. XML now has aggregate JSON-profile value/byte allowances with terminal exhaustion and a Unicode boundary regression. The engine is untouched.
- `pnpm typecheck`, `pnpm check` and the additional unused-local/parameter audit pass. Offline checks include 6 XML mechanics groups,14 HTML record groups,23 reference checks,44 HTML discovery groups and 19 benchmark tests; those counts are separate check categories, not fresh-model accuracy.

## Frozen live batch

The existing five suites ran without source/workflow/suite changes.114 source/config/test/runner files were hashed before calls and match afterward. No saved answers or manual artifact corrections were used. Models ran only during discovery. Original captures and every provider response/trial remain retained.

| Suite                   | Discoveries | Correct by frozen check | Returned but failed check | No artifact | Provider requests | Reported input tokens | Reported output tokens | Discovery elapsed |
| ----------------------- | ----------: | ----------------------: | ------------------------: | ----------: | ----------------: | --------------------: | ---------------------: | ----------------: |
| HTML 17 tasks twice     |          34 |                      25 |                         2 |           7 |               122 |             1,432,996 |                239,050 |          969.07 s |
| JSON                    |           2 |                       2 |                         0 |           0 |                 4 |                19,327 |                  5,928 |           77.76 s |
| XML                     |           2 |                       2 |                         0 |           0 |                 6 |                59,458 |                  5,887 |           78.82 s |
| XML → article → PDF     |           1 |                       1 |                         0 |           0 |                 5 |                39,523 |                  9,254 |           86.02 s |
| Structured HTML records |           2 |                       2 |                         0 |           0 |                 9 |                79,034 |                 23,570 |          146.08 s |
| **Total**               |      **41** |                  **32** |                     **2** |       **7** |           **146** |         **1,630,338** |            **283,689** |    **1,357.75 s** |

Elapsed is the sum of suite discovery wall times, including pacing, excluding separate replay/import/startup work. HTML used 4 concurrent jobs; the other suites used 1. The sum of individual request waits is 2,989.67 s and overlaps across HTML workers; it cannot be subtracted from wall time. The pacer also imposes an initial 60 s wait per suite. Two HTML 429 quota responses reported no usage;144/146 requests supplied usage. Reported tokens are therefore observed usage, not a complete billable estimate. All raw responses remain available.

All 34 published artifacts completed captured-source and fresh-HTTP execution with **zero model calls**.32/34 passed each frozen accuracy check. Mechanical completion of the two others did not make their outputs correct. There were no ungraded results. All 21 configured changed/added/empty/namespace variants passed: JSON 6, XML 9, reference links 2, records 4.

Captured execution median 6.64 ms, total 343.40 ms for 34 artifacts. Fresh HTTP execution median 145.50 ms, total 10,978.48 ms for 34 artifacts. These include selection/mapping and HTTP capture work, but exclude preparation. They are different artifact workloads, not a controlled speed comparison.

## Remaining failures

1. **Starting-stage navigation review: 4/4 rejected.** Both Django linked-post and both SQLite release-note attempts returned no artifact. The reviewer demanded destination headings/article bodies/change lists while reviewing the initial page's onward links. It did this despite `canFollow:true`, the frozen navigation task and a prompt sentence distinguishing navigation stages. The current review contract/model behavior is insufficiently reliable here. Failed review/repair prevented publication; this is a discovery failure, not runtime AI or a transport limitation.
2. **Current-page author/repair failures: 3 attempts.** One zlib, one Ruby and one 7-Zip run remained unresolved. zlib first included an unrelated archive, then missed the generic current-release alias; Ruby missed documentation links, then included unrelated links;7-Zip included historical installers. Their paired runs returned artifacts, but zlib's paired artifact was still incomplete.
3. **zlib false acceptance: 1 returned artifact.** It returns 3 of 4 independently required download links, missing `current/zlib.tar.gz`, on both captures and fresh HTTP. Model review accepted it. No schema/check establishes full semantic completeness.
4. **Django news representation mismatch: 1 returned artifact.** Frozen grading requires 20 separate headline/intro elements; the artifact returns 10 records with dynamic `headline`/`intro` fields. An additional AI-free comparison confirms all 20 expected field text values, in source order. Native record text also contains surrounding content, and the representation differs. The original failed grade is preserved; this is not evidence that 10 news items were lost or permission to change grading after seeing results.
5. **Frozen-version reuse remains unresolved.** Old 7-Zip artifacts still pass 2/2 original captures and only 1/2 changed-version captures. The one newly returned 7-Zip artifact also fails the changed-version check: its required precondition embeds 26.05. It stops with `CHECK_FAILED` instead of returning a usable new-version result. This is an explicit failure, not successful reuse.
6. **Saved Steam identity failure persists.** Replayed without AI: 7/8 checks pass; adding an unrelated offer producesEUR 0.99 instead of the requested game'sEUR 7.99. Structured fields have not established a fix for that artifact.
7. **Historical PDF fixture remains failed.** HTTP returns 301; the unchanged artifact requires 302 and fails `redirect-observed`. The new XML-to-PDF success does not waive that failure. Resolve the intended fixture contract explicitly before claiming an all-green release; do not loosen it silently.

The stage-review contract and two benchmark contracts were subsequently addressed by the approved closing slice below. Remaining model mistakes and reuse risks are accepted limitations, rather than a new perfection gate for the Nisc move. No additional reviewer layer, runtime semantic verifier, provider escalation or browser framework was introduced. Original full-batch scores remain unchanged.

## Performance and package proof

For 1,000 number-increment operations, median prepared-artifact execution was 0.938 ms versus 0.115 ms directly invoking the same validated operations. Preparation was separate. The extra 0.823 ms covers interpreting the artifact, mappings/checks and run control. This test performs no HTTP or AI.40 interleaved samples after warmups were used.1,000 iterated items measured 2.183 ms through the artifact versus 0.153 ms directly. These establish local dispatch behavior on Node 24.13.1/Windows x 64, not every supported OS/Node version.

The package is private `@niscorp/haptic@0.1.0` in the Nisc workspace pending its first release. The packed consumer check runs existing returned artifacts twice concurrently against their unchanged captures with a loader blocking Cortex, Signal and OpenAI imports. Discovery peers are installed separately afterward; declaration checking and discovery import make no provider call. The archive contains only declared build files, license, README and selected development contracts; no credentials, original captures, benchmark runners or tests. ESM is supported; CommonJS is not offered.

## Evidence and reproduction

Machine-readable aggregation: `data/runs/release-verification-2026-10-29/batch-summary.json`; source freeze: `frozen.json`; reviewer dispositions: `reviews.json`; offline logs, saved Steam/7-Zip results, new 7-Zip failure and Django supplemental comparison are beside them. Package tarballs and consumer logs are in dated `data/runs/package-*`; the final verification summary records their exact path/hash. Original evidence folders remain untouched.

- HTML: `data/runs/discovery-2026-10-29T13-38-33-662Z`
- JSON: `data/runs/discovery-2026-10-29T13-54-55-123Z`
- XML: `data/runs/discovery-2026-10-29T13-56-14-443Z`
- Reference: `data/runs/discovery-2026-10-29T13-57-35-030Z`
- Records: `data/runs/discovery-2026-10-29T13-59-03-112Z`

Run `pnpm typecheck`, `pnpm check` and `pnpm benchmark`. These establish mechanical contracts and interpreter performance, not fresh model discovery accuracy. Build before `pnpm run check:package <returned-run/replay-manifest.json>`. The obsolete `check-discovery` paid runner has been deleted: it depended on retired prompt and artifact layouts and could grade native selected nodes instead of requested final data. The original 17-task list remains historical input, not a current accuracy contract; sixteen tasks need independent final-data expectations before a new paid batch. Do not replay into a historical run folder when preserving it: copy its manifest/suite into a new evidence folder. Replay grading now requires independent final-data expectations or an explicit download contract before any HTTP. See [public contracts](public-api.md) and [Nisc handoff](nisc-handoff.md).

## Focused closing slice — 2026-10-29

The existing review prompt now judges the current stage: `selector` supplies current-page results; `links` supplies onward destinations. It cannot demand unseen destination content or future selectors. It must still reject omissions of results required from the current page, including when the author proposes navigation only. The verdict shape, agent, repair policy and engine are unchanged. A focused independent grammar review caught that latter omission guard; it was incorporated before paid tests.

The Django news benchmark now requests an explicit array of `{headline,intro}` objects. An independent record/field extraction and Prism mapping supply expected data, excluding bylines and other content. Offline controls reject missing records/fields, incorrect intro text and extra output properties. This is a changed benchmark contract, not a regrade of the original failed artifact.

The current live PDF fixture composes the existing JSON `fetch`/`redirect` helpers and declares redirect allowances and terminal status/media policies. It verifies the downloaded bytes/hash/PDF signature. Its previous exact-302 artifact is archived at `data/runs/closing-slice-2026-10-29/original-exact-302-artifact.json`; the old failed results stay failed. Controlled offline checks cover 301, 302, 303, 307, 308, mixed chains, resource redirects, missing Location, redirect allowance, loop rejection and terminal HTTP failure. The loop is rejected through existing input validation; this slice adds no new loop-error API.

| Focused test                                 | Result                                                                                                      | Provider requests | Reported input tokens | Reported output tokens |       Elapsed |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------: | --------------------: | ---------------------: | ------------: |
| Fresh verdicts on unchanged saved candidates | 8/8 correct: four navigation failures, two valid controls, two invalid controls                             |                 8 |               146,086 |                 14,781 |       104.25s |
| Three fresh request+URL discoveries          | 3 artifacts; 2/3 strict output checks on captures and fresh HTTP; both traversal navigation stages accepted |                15 |               312,627 |                 31,503 |       317.63s |
| Updated live HTTP → PDF contract             | Passed; one 301 followed by terminal HTML and a 116,547-byte PDF                                            |                 0 |                     — |                      — | No model call |

All 23 provider responses reported usage; no quota failures occurred. Total reported usage was 458,713 input and 46,284 output tokens. The two paid phases took 421.88s including 275.57s of quota pacing. The initial saved-case harness used the post-review cleared rule field and failed offline admission before any provider call; its evidence is preserved. The corrected harness reads each original, unedited author decision, verifies its candidate against independent source selection and admits all eight review inputs offline before calling the real library review flow. Grading labels never enter model inputs.

Fresh results:

- **Django news:** passes its explicit output schema and independent data check, with no bylines or surrounding content in `data`.
- **SQLite traversal:** visits the three independently expected pages and returns the required headings/change lists. Captured and fresh HTTP checks pass.
- **Django traversal:** now accepts the starting navigation stage and visits all three correct article URLs. Strict output grading remains failed: it returns one container record with title/body fields per page instead of two separately selected elements. All six field text values exactly match the independent heading/body texts, but native container text includes surrounding content. That supplemental comparison does not turn the strict failure into a pass.

All three returned artifacts execute without AI or manual corrections. No broad paid batch was repeated. All 111 source/test/runner files in the focused freeze remain unchanged throughout the paid phases; source engine files remain unchanged. `pnpm typecheck` and `pnpm check` pass, including 20 benchmark tests and the new redirect contract checks. Current package smoke verification uses the two fully graded artifacts; it is separate from discovery accuracy.

The agreed closing defects are addressed within this evidence. Occasional semantic errors, strict output-selection mistakes and drift remain accepted limits. The next step is the package name and Nisc move, rather than an open-ended campaign for perfect scores.

Focused evidence: `data/runs/closing-slice-2026-10-29/verification.json`, raw saved-review calls under `reviews-2026-10-29T14-35-27-592Z`, and fresh discovery under `data/runs/discovery-2026-10-29T14-38-26-457Z`. The old full-batch results and counterexamples are unchanged.
