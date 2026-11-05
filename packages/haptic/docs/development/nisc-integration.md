# Nisc integration

The authorized transfer integrates the committed Eden-next handoff 96966eea24fd2ca1367004cfaa0bb55152352d21 (runtime checkpoint 37527db8c3bff85848b7d4372f2ca66e072b6b4f) as packages/haptic, private @niscorp/haptic@0.1.0. Original research, evidence, credentials and Git history remain in Eden-next. No publication or push is performed.

## Package setup

Apache-2.0, public release metadata, strict ESM/NodeNext declarations, explicit export and file allowlists. Runtime, operations, discovery, search, optional recovery/codec and migrations are separate entries. Node >=22.13.0; ESM-only intentionally preserves the tested package contract. Nisc's package gate records that contract rather than declaring nonexistent CommonJS output.

Prism, Strata, Cortex, Signal and Zod are peers; model and codec peers remain optional. Dev dependencies pin the tested published versions. The destination checkout currently has Signal 0.1.5 while Haptic requires 0.1.6's recovery. Registry pins deliberately preserve the tested implementation instead of linking an older sibling. No sibling dependency or model behavior is changed by this transfer.

## Strata

The migrations entry exposes ENGINE_SEQUENCE and strict ENGINE_SCHEMAS. Nisc's existing grammar gate includes Haptic, with generated eden.engine/1 snapshot and unchanged captured artifacts from grammar version 0. Stored identities and stamps remain unchanged. These are document migrations only: no database, journal or persistence adapter. No artificial grammar increment accompanies a package rename.

## Verification

From the workspace: pnpm --filter @niscorp/haptic typecheck; pnpm --filter @niscorp/haptic check; pnpm --filter @niscorp/haptic check:package; pnpm check:grammars; pnpm check:api. Root build/test discover the new workspace package automatically. CI additionally runs the isolated Haptic consumer check. It verifies optional-peer isolation, strict declarations and AI-free execution of saved artifacts. No paid model tests or prompt changes are part of this integration.

## Verified integration

The destination workspace build passed (21 tasks) and its full typecheck passed (37 tasks). Nisc's packed-package gate passed 285/285 checks. Haptic's existing full offline suite passed 57 modules and 33 benchmark tests. Its isolated consumer passed all three installation phases and four AI-free executions of two saved artifacts, including migrations import/types and absence of optional model/codec peers during core execution. The HTTP-only PDF regression retrieved the expected 116547-byte file.

Nisc's grammar gate passed 159/159 documents, including both original Haptic artifacts from grammar version0. Its generated eden.engine/1 snapshot matches. The public API gate includes all seven Haptic code entries and64 names. The existing SQL gate sweeps Haptic; the module-door gate still governs Moss only and does not claim to enforce Haptic boundaries. Haptic's existing cross-directory imports were preserved rather than refactored during transfer.

Byte comparisons preserve90 existing runtime source files (every original src file except the explicit main re-export list) and24 fixture files. All26 pre-existing workspace lockfile importers remain unchanged. Independent packaging and Strata reviews identified no remaining concrete integration issue after the documented corrections. These are engineering/compatibility checks, not new discovery accuracy evidence; zero paid model calls were made.

Local detailed logs and preservation hashes are under packages/haptic/data/runs/. Original Eden-next evidence and credentials remain at their original locations. No source-engine, discovery-policy, prompt, model-setting or stored-stamp change was made.

## Release

Keep private:true until the separately authorized first release, as required by ../../../../docs/releasing.md. Haptic is not yet added to the released @niscorp/nisc version set, which cannot depend on an unpublished package. Publish dependencies first, remove private in a release commit, run the existing first-release workflow and configure npm trust; only then add it to the meta package. Publication and npm trust require the maintainer's npm authorization and are not performed here.
