export const money = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $gte: [value, 1_000_000] }, then: { $join: { parts: ['$', { $round: { value: { $div: [value, 1_000_000] }, digits: 1 } }, 'M'], sep: '' } } },
      { when: { $gte: [value, 1_000] }, then: { $join: { parts: ['$', { $round: { value: { $div: [value, 1_000] }, digits: 0 } }, 'K'], sep: '' } } },
    ],
    else: { $join: { parts: ['$', { $round: { value, digits: 0 } }], sep: '' } },
  },
});

export const dateText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'MMM D, YYYY' } } }],
    else: '—',
  },
});
