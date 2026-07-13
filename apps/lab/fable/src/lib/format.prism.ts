// Presentation fragments authored into the cache entries' Prism mappings —
// formatting lives in the cache, on the way out of Vex, never in TypeScript.
// Each takes the raw value NODE (a row field expression) and returns a Prism
// subtree. Loosely typed (Prism configs are an open union; `compile` takes
// `unknown`), so no casts are needed at the call sites.

// Friendly date "MMM D" (null/empty → "—").
export const dateText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'MMM D' } } }],
    else: '—',
  },
});
