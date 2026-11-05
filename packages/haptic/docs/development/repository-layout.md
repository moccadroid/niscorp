# Repository layout

This is one private headless Node library with ESM TypeScript. Dependencies are pinned in package.json and pnpm-lock.yaml. TypeScript uses NodeNext resolution; internal runtime imports include .js extensions.

| Location | Purpose |
| --- | --- |
| src/ | In-memory interpreter and generic native operations. |
| tests/ | Automated checks and small fixtures. |
| benchmarks/ | Benchmark runners, process samplers and fixed budget files. |
| scripts/ | Build, cleanup and operational maintenance tools. |
| docs/requirements/ | Desired behavior. Requirements do not approve an architecture. |
| docs/operations/ | Operations for retained implemented components. |
| docs/plans/ | Explicitly proposed work; implementation requires approval. |
| docs/history/ and docs/measurements/ | Historical context and dated evidence. |
| data/ | Ignored source evidence, fixtures, reports and generated runs. |
| dist/ | Ignored, reproducible JavaScript build output. |

Build removes stale dist output before compilation. pnpm clean targets only dist; it never removes original evidence, credentials or database volumes.

The earlier extraction/discovery implementation and the subsequent database-backed v5 runtime are rejected. Their source, schemas, exports, plans and reviews are not a foundation to restore. Follow AGENTS.md and docs/development/artifact-execution.md.

Root documentation is limited to README.md and AGENTS.md. No Python scripts or runtime dependencies are used. Historical records may retain old parser names and paths as provenance; those are not current execution instructions.
