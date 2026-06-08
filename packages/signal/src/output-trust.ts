// ═══════════════════════════════════════════════════════════
// asOutput — the single trust boundary for Signal's output type
// ═══════════════════════════════════════════════════════════
//
// When a request carries no Zod schema, the builder's type parameter
// `T` is `string` by construction: `createSignal()` starts as
// `Signal<string>` and `T` only widens when you call `.schema()`. In
// that no-schema branch the model's raw content already IS the output
// (a string) — but the generic function bodies can't prove `T = string`
// from a runtime `!schema` check.
//
// So this is the ONE place that coercion lives: named and explained,
// instead of scattered `as unknown as T` at every no-schema return.
// (Mirrors @niscorp/cortex's `trustAgentReturn`.) Any path reachable
// only WITH a schema returns validated `result.data` and never touches
// this helper.
export const asOutput = <T>(content: string): T => content as unknown as T;
