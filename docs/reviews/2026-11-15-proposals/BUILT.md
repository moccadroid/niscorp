# What was built from the "ready" list

The owner's go: "Yes, build those" — the proposals listed under "Ready to build: changes nothing for a working app" in [README.md](README.md). Each group was built on its own branch from `review-fix/all-check` (ee3572e7), checked by an independent agent against "an app that works at ee3572e7 sees the same results", and given one fix round. All seven branches are merged into `review-fix/all-check` (928a17dc). Nothing is pushed.

| Branch | Built | Left out, and why |
|---|---|---|
| `review-build/moss-charter` | P-M1a, P-M3, P-M4, P-M6, P-M8, P-M9, P-M10, P-M11 (internal names and prose), P-X1, P-C1 (moss part), P-C5, P-C6 (`functions` field); P-C4 was already on the branch | — |
| `review-build/nova` | N5, N6, N15, N19, N20 | **N9, N13**: their new action fields bump nova's grammar 2 → 4, which makes every app's `check` fail until it runs `strata upgrade` (all five lab apps and every created app). Reverted. A form outside the grammar (a per-canvas `keepTyped`, a per-shell `encodeUrlValues`) is an owner decision and needs a moss change. **N21**: the typed lint refuses nova's exported error classes, the React error boundary (must be a class) and exported type guards; meeting it would break apps. |
| `review-build/vex` | P4, P11, P12, P14 (null `intent`/`fingerprint` only), P18 | **P17**: a hand-built `ResolvedQuery` passed to the public `compile` could reach the "dead" branch. **P14 nested nulls**: removed — `testQuery` would approve drafts the agent's final check refuses, costing a retry. |
| `review-build/prism-loom` | P2, P14, P16, P18, P22, P23; L6, L7, L9, L10, L11, L12 (module doors) | **P21** (`timeZone` option): without P15 (an "Owner to confirm" item) the optimizer works out a `$date` on a literal ahead of time, so the option would be ignored from the second call. **L12 core classes**: needs a choice between two designs. **loom in `check-modules`**: fails on `validate.ts` and the import aliases — a separate case. |
| `review-build/signal-cortex-solid` | SIG-P2, SIG-P5 (reading only), SIG-P7, SIG-P8 docs, SIG-P9, CTX-P5 (plain string schemas only), CTX-P8, SOLID-1 and its `slice()` copy, SOLID-P8, SOLID-P9 | **CTX-P6**: would change requests sent to the provider today (unknown roles, `system`/`tool` items without content). |
| `review-build/tide-strata` | P-T3 (fixes + opt-in `resume`), P-T4, P-T5, P-T8 (load warning), P-T10, P-S2, P-S4, P-S5, P-S6, P-S7 | — |
| `review-build/cli-create-nisc` | P4, P5, P6, P7, P10, P11, P12, P13, P14, P16, P17, P18, P19 (narrowed), P20, P22, P23, P24, P29, and P-C1's cli and template parts | — |

Changes the checks found and the fix rounds removed before merging: the tide fan-out waiting after a `load([])` and a lease that could shorten when a clock stepped back; loom's `onChange` skipping writes whose JSON text was unchanged; CTX-P5 taking raw text for any schema with a string branch (nova layouts, prism configs).

## The combined run (review-fix/all-check, 928a17dc)

- All 13 packages build. Every package's tests pass; nova's Ink focus test timed out once while four suites ran at once and passes alone (886/886, twice).
- Root checks: `check:api`, `check:modules`, `check:raw-sql`, `check:fact-door`, `check:grammars`, `check:sources`, `lint`, `check:changesets`, `check:packages`, `check:create` (66/66) — all pass.
- Lab apps: every typecheck passes. `check` gives the same results as on main for atrium (1 of 18 fails), encore (1 of 13), fable, lyceum, lyra-integrations, mythos (pass). **lyra could not be compared**: on this machine `npx tsx` now resolves to a path that does not exist, in both this branch and main, from PowerShell and bash, so its 51 checks cannot start in either. Earlier today the same command ran on main with 1 of 51 failing.
- `check:create`'s new production-install step has run on Windows only. CI (Linux, pnpm 9.15) has not run it.
