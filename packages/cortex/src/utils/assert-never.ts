// Exhaustiveness helper for discriminated-union switches. Compiles
// to a type error if a variant goes unhandled; throws at runtime if
// an unexpected value somehow reaches it (broken provider, forward-
// compatible schema, etc.) — no silent drops.

export const assertNever = (x: never): never => {
  throw new Error(`unexpected value: ${JSON.stringify(x)}`);
};
