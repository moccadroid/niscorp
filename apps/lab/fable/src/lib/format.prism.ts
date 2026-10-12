export const dateText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'MMM D' } } }],
    else: '—',
  },
});
