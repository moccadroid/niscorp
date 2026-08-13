// ═══════════════════════════════════════════════════════════
// Indexed reads, with the check the compiler asks for
//
// `noUncheckedIndexedAccess` is on across the repo, so `xs[i]` is `T |
// undefined`. Most reads here sit one line below an assertion that the array
// is long enough — true, and invisible to the compiler.
//
// A `!` would silence it. These say the same thing and fail with a sentence
// instead of a TypeError three frames away, which matters because the case
// that trips them is a stream that produced FEWER events than expected — the
// exact failure the test exists to catch.
// ═══════════════════════════════════════════════════════════

export const lastOf = <T>(items: readonly T[]): T => {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error(`expected a last item, but the list is empty`);
  return item;
};

export const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an item at ${index}, but the list holds ${items.length}`);
  return item;
};
