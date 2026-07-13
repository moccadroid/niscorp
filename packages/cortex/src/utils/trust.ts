// ═══════════════════════════════════════════════════════════
// Trust boundary — the ONE file where casts live
// ═══════════════════════════════════════════════════════════
//
// The style guide forbids `as`. Two places in cortex genuinely
// cannot be expressed without a cast, and both live here, named
// and documented. Nothing else in the package may cast.
//
// 1. Registry erasure. The manifold stores heterogeneous
//    AgentDefinition<TData, TDeps> values in one Map. Function
//    parameter contravariance makes the typed definition
//    unassignable to an erased form, even though every call path
//    re-establishes the types at the boundary (the caller of
//    manifold.run names the type it expects; deps are validated
//    by the agent's own context functions at run time).
//
// 2. Absent data. An agent defined WITHOUT an output schema has
//    TData = undefined by construction (defineAgent's default
//    type parameter). Inside generic helpers the compiler cannot
//    connect "no schema" to "TData is undefined", so producing
//    the `data: undefined` field of Envelope<TData> needs one
//    documented coercion.
//
// 3. JSON Schema records. z.toJSONSchema returns a structured
//    JSONSchema type that IS a plain record at runtime but does
//    not declare an index signature (a Zod typing gap — signal
//    carries the same cast at its own call sites).

export const trustErased = <T>(value: unknown): T => value as T;

export const trustUndefinedData = <TData>(): TData => undefined as TData;

export const trustJsonSchemaRecord = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;
