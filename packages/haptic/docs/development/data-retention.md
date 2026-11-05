# Local data retention

Original evidence is immutable. A generated copy is not a new source observation; source occurrences and bytes have different identities.

| Location | Contents |
| --- | --- |
| data/fixtures/source-replay/ | Canonical 115-document reader fixture, including original evidence and reference representations. |
| data/fixtures/pdf-validation/ | Original adversarial PDF and historical source/appearance validation results. |
| data/fixtures/http-transfer.bin | Small fixed transfer seed for repeatable interruption benchmarks. |
| data/inventory/germany/2026-10-14/ | Corrected 34,363-notice snapshot, original source archives, manifests and telemetry. |
| data/research/german-api/ | Original API research samples and source exports. |
| data/objects/sha256/ | Unique archived evidence bytes, keyed by SHA-256 with a two-character prefix. |
| data/reports/ | Compact benchmark/validation history, migration proof, retention audit and evidence occurrence index. |
| data/runs/ | New run output, staging and experiment copies; disposable only after required evidence and results have been retained. |

The 2026-10-15 cleanup consolidates historical evidence rather than retaining every benchmark response copy, old deployment, heap dump and intermediate representation. Each retained historical evidence occurrence records its original path, verified SHA-256, byte count and object key in reports/evidence-occurrences.jsonl.gz. Original manifests and compact reports retain their historical paths; the occurrence index resolves archived evidence after directory removal. SHA-256 addresses bytes, not a notice, tender or observation. Existing source receipts and archive ancestry remain in the preserved manifests.

The host archived object collection remains historical retention infrastructure. The former shared download store and persistent acquisition queue used a separate Docker artifacts volume. Those existing volumes remain protected historical data; they are not dependencies of the replacement library.

pnpm clean only deletes generated JavaScript. There is no automatic evidence deletion, age-based purge or PostgreSQL-volume deletion. Large run output should be reviewed and consolidated deliberately; keep evidence, provenance, relevant reports and canonical regression fixtures. Retired Python executables and generated caches are not retained as project tooling. Historical reports can mention removed experiments without implying that their disposable process folders still exist.

The rejected catalogue and queue deployment used the Docker artifacts volume: /app/data/objects held canonical blobs and /app/data/runs/acquisition held attempt journals and evidence aliases. The host data/ mount was read-only at /archive. These stores can contain original evidence and must not be deleted during source cleanup. Preserve their records, receipts, lineage and timing reports. Do not start a catalogue service or implement persistence merely because historical data exists.

The user approved and completed the 2026-10-19 cleanup of 287 active files and 41 generated source-review snapshots, separately from sibling trial evidence and results. Its exact file inventory is data/runs/pure-engine-reset/deletion-manifest.json; deletion-result.json records execution. The manifest is historical evidence, not authorization to delete replacement files at reused paths or any unlisted data. Historical records are not implementation guidance.
