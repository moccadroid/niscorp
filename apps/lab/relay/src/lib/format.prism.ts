// Presentation fragments authored into the cache entries' Prism mappings —
// formatting lives in the cache, on the way out of Vex, never in TypeScript.
// Each takes the raw value NODE (a row field expression) and returns a Prism
// subtree. Loosely typed (Prism configs are an open union; `compile` takes
// `unknown`), so no casts are needed at the call sites.

// Compact currency: $1.8M / $48K / $500.
export const money = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $gte: [value, 1_000_000] }, then: { $join: { parts: ['$', { $round: { value: { $div: [value, 1_000_000] }, digits: 1 } }, 'M'], sep: '' } } },
      { when: { $gte: [value, 1_000] }, then: { $join: { parts: ['$', { $round: { value: { $div: [value, 1_000] }, digits: 0 } }, 'K'], sep: '' } } },
    ],
    else: { $join: { parts: ['$', { $round: { value, digits: 0 } }], sep: '' } },
  },
});

// Friendly date "MMM D, YYYY" in local time (null/empty → "—").
export const dateText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'MMM D, YYYY' } } }],
    else: '—',
  },
});
