# Local discovery dataflow

Continue the approved fixed JSON pipeline. The same-standard review found that contracts made whole-state forwarding safer without removing its cognitive coupling. This work changes private producer/consumer contracts, not the execution grammar, prompts, model settings or permissions.

## Ownership changes

- Model accounting receives one allowance and reported step/time usage; it returns only the remaining allowance. It cannot choose an author/reviewer owner or forward unrelated state.
- Model history receives explicit history/feedback/round inputs; it returns history values. Callers own their phase state.
- Captured execution receives artifact, captures and URL. Its unused blueprint argument is deleted.
- Output binding receives only the shaped flow it uses, rather than a complete blueprint.
- Schema/mapping/review jobs receive strict named inputs and return only their owned outputs. They cannot see traversal levels, unrelated acquisition state or whole profile objects.
- Source authoring receives one current level and its materialized frontier, explicit required configuration/authority values, and its author allowance/history/feedback. It returns only `{level,part,feedback,allowance,histories,reason}`. Local request/inspection/trial helpers consume narrower named slices; no whole-state source wrapper remains.
- Traversal owns its closed acquisition/level/frontier frame and only the author allowance. Acquisition returns its produced current-level/capture/owned changes; advancement returns only `{depth,frontier,hasNext}`. Root retains review/output/last-working values and explicitly merges traversal's returned author allowance. The source job cannot update another level or reviewer allowance.
- `level-sources` takes only `{level,owned,captures}`. Traversal materializes the current frontier once; source request and inspection share its exact indices/identities. The superseded `frontier-sources` wrapper is deleted without an alias.
- Root composes the fixed phase results and retains the original whole-pipeline repair and last-working selection. Phase intermediates leave root initial/reset state when their consumers use the owning step outputs.
- Fresh verification receives only URL and artifact; its result contains only the fresh trial, publication flag and reason.

No generic state/patch controller, dispatcher, new DSL, controller restoration or native policy is introduced. Remove the superseded interfaces rather than retaining aliases. Shared pure schemas have one definition.

## Required preservation

Keep actual model-bound messages/settings, history scopes, source values and order. Local retries charge the same remaining allowance. Only the existing bounded review correction renews configured allowances. Caller schemas and permissions remain fixed. Failed corrections retain the prior matching artifact/schema/trial/verdict while preserving new spending/history. Resource/alias charges and all limitation contributions survive. Cancellation, integrity/resource controls and failed fresh trial remain terminal. Mechanical availability remains independent of advisory semantic review.

## Evidence and checkpoint

The initial leaf-job refactor froze source/tests at `data/runs/local-discovery-dataflow-2026-11-04/before`. The source/traversal extension freezes its own baseline at `data/runs/source-ownership-refactor-2026-11-05/before`. Its before/after public-pipeline trace preserves 787 events exactly: 95 public outcomes, 447 controlled model inputs with byte-exact message strings/settings, and 245 top-registry HTTP-operation inputs. Actual comparisons and hashes are recorded in `parity.json`; nested trial behavior remains covered by the original fixture assertions. These prove preservation and ownership, not fresh model accuracy.

Malformed local inputs and false source success are rejected before effects by independent boundary controls. Existing successful, failed, exhausted and skipped paths; scoped history and active feedback; review correction; changed/added/empty data; redirect/alias/resource behavior and terminal controls remain required. Engine and model profiles stay byte-identical. Final full-suite/package and HTTP-only PDF verification belongs to the refactor's final evidence rather than the older baseline.

Run focused checks during integration, then the complete offline/package checks and HTTP-only PDF control. Review the completed producer-to-consumer change at one substantive checkpoint using the original category sets and meanings. No target grade is evidence. Do not raise unattended-readiness or claim new model accuracy from this refactor. No paid model tests are part of this slice.
