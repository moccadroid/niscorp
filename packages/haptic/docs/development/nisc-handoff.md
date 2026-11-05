# Nisc integration update

Haptic is now integrated into `packages/haptic` as private `@niscorp/haptic@0.1.0`. See [Nisc integration](nisc-integration.md) for current setup. The original Eden-next source, evidence and credentials remain intact. Publication is separate.

The following is the pre-transfer handoff record; its transfer restrictions describe that earlier checkpoint.

# Nisc package handoff

Haptic is prepared here as an unpublished, best-effort library. Its temporary package identity remains private `eden-next@0.0.0`. The current cleanup does not move, link or modify the Nisc workspace, and it does not publish a package.

The [current status](current-status.md) owns engineering and semantic evidence; the [builder](discovery-builder.md) describes the fixed JSON pipeline. [Limitations](limitations.md) records the accepted scope. Working artifacts return automatically with advisory review; there is no manual artifact-approval requirement. Another paid discovery batch, perfect results or a higher review grade is not part of this handoff.

## Final handoff checkpoint — 5 November 2026

The implementation is committed as `37527db8c3bff85848b7d4372f2ca66e072b6b4f` on `codex/clean-discovery-checkpoint`. The [final engineering record](../measurements/haptic-handoff-2026-11-05.md) preserves the supported contract, exact verification summary, review categories and accepted limitations outside private run directories. Subsequent handoff changes affect documentation, its package allowlist and fixture-byte Git attributes only; runtime source, tests and dependency versions remain at that implementation checkpoint.

Final clean-copy verification passed typecheck/build, 57 offline modules, 33 benchmark checks, all three isolated consumer phases, four AI-free packaged-artifact executions and the live HTTP-only PDF check. The 787-event before/after preservation trace matches exactly. Engineering reviews concluded code quality 9, Nisc adherence 9.5 and architecture 9; these are subjective assessments with no confirmed open engineering finding, not new model-accuracy evidence. The normal checks below are reproducible without model credentials or historical run directories.

Everything stays in this repository. The remaining transfer work is only the separately authorized destination integration below. Publication is a separate release action. No more experiments, model tuning or speculative architecture work is required by this handoff.

## Verification

Run `pnpm typecheck`, `pnpm check`, `pnpm run check:package` and `node scripts/check-live-pdf.mjs`. The normal checks are offline; only the final PDF command accesses a live endpoint and none requires model credentials.

The package check defaults to repository fixtures under `tests/fixtures/package/`. Its historical manifest argument remains available for explicit archived replays, but is not needed for handoff or CI. Package consumption uses an outside-checkout temporary consumer, an offline installation seeded by the workspace lockfile and disabled lifecycle scripts. Automatic peer installation is disabled while optional dependencies required by compiler tooling, including TypeScript's platform compiler, remain enabled.

The three consumer phases verify:

1. Runtime/operations and image-choice contracts without optional model/codec peers. Two independently graded saved artifacts execute twice each with model imports forbidden.
2. Discovery/search declarations and imports after explicit installation of their model peers, without a provider call.
3. The explicit ImageScript entry after installing its optional peer.

Archive checks require all export targets and runtime JSON assets, and exclude research captures, credentials, source files, tests and tooling. Strict declaration checks use the consumer's compiler and explicit Node types. Results record the actual Node version and tarball hash. This verifies the tested dependency graph and package mechanics, not live discovery accuracy or arbitrary newer dependencies.

On 5 November, after the two concrete review corrections, typecheck/build, all 56 offline modules, 33 benchmark checks, the HTTP-only PDF regression and all three isolated package-consumer phases passed. Four artifact executions used no AI. Evidence is under `data/runs/review-corrections-2026-11-05/`; this is a dated verification, not a claim about later edits. Final cleanup verification must record its own revision and package hash.

The [4 November qualification](../measurements/nisc-qualification-2026-11-04.md) remains the dated broader semantic assessment. Its failures and grades are unchanged. Earlier handoff, controller and model experiments remain historical evidence, not instructions to restore retired machinery or reopen model optimization.

## Package contract to preserve

- Separate typed runtime, operations, discovery, search and optional image-codec entries. Mechanical execution does not import model peers.
- JSON artifact → in-memory engine → result data, with no database, mandatory persistence or model credentials in artifacts.
- Actual published Prism mapping agent, Cortex/Signal recovery ownership and Strata grammar stamps.
- Apache-2.0 license, strict ESM/NodeNext declarations, explicit package contents and shipped runtime JSON assets.
- Optional host mechanics and codec resources remain host-owned; no browser or codec loads by default.
- Original captures, failed trials, credentials, database volumes and Git history stay protected. Only selected documentation and required test fixtures belong in the handoff.

The package declares Node `>=22.13.0`; the recorded verification above used Node v24.13.1. It does not claim CommonJS support or a tested runtime matrix. Read-only inspection of Nisc package/style/release conventions was performed on 29 October; refresh the applicable destination instructions at an authorized move. A move does not authorize rewriting the engine, adopting a new test framework or adding CommonJS metadata without working output.

## At the authorized move

1. Move package-owned source, tests, fixtures, benchmarks, scripts, build settings, license and documentation into the intended Nisc package. Preserve the original research evidence here.
2. Set the real Haptic package identity, initial version, repository/homepage metadata and release access. Update imports and consumer verification together. Apply Nisc workspace dependency conventions and verify the packed manifest resolves released dependencies. Keep optional peers optional.
3. Connect the existing checks to Nisc CI and run them on the declared supported runtime configuration. Verify the packed package from an independent consumer outside the destination checkout.
4. Record the source revision, verification results and tarball hash. Follow the destination's changeset/release process; actual publication requires separate release authorization.

The stored `eden.engine` grammar identity belongs to existing artifacts and is not a package-name placeholder. A package rename must not rewrite it. Future grammar changes belong to its Strata sequence.

The move is complete when a clean Nisc checkout builds and passes the existing checks and an independent consumer installs the package and executes its saved artifacts without AI. Accepted semantic limitations and deferred capabilities remain explicit; they do not create another cleanup project.
