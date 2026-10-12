export const dateText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'ddd D MMM' } } }],
    else: '—',
  },
});

export const stampText = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $date: { value, format: 'D MMM, HH:mm' } } }],
    else: '—',
  },
});

// `SUM` over no rows is NULL, so an absent value prints €0.
export const money = (value: unknown) => ({
  $case: {
    branches: [{ when: value, then: { $join: { parts: ['€', { $round: { value, digits: 0 } }], sep: '' } } }],
    else: '€0',
  },
});

export const stateText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'in_house'] }, then: 'In house' },
      { when: { $eq: [value, 'arriving'] }, then: 'Arriving today' },
      { when: { $eq: [value, 'booked'] }, then: 'Booked' },
      { when: { $eq: [value, 'departed'] }, then: 'Checked out' },
    ],
    else: value,
  },
});

export const reasonText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'live'] }, then: 'Live' },
      { when: { $eq: [value, 'connector'] }, then: 'Not in the live integration' },
      { when: { $eq: [value, 'property'] }, then: 'Switched off by the property' },
      { when: { $eq: [value, 'disabled'] }, then: 'Withdrawn by Atrium' },
      { when: { $eq: [value, 'source'] }, then: 'From an integration this hotel does not run' },
    ],
    else: value,
  },
});

export const reasonTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'live'] }, then: 'good' },
      { when: { $eq: [value, 'connector'] }, then: 'warn' },
      { when: { $eq: [value, 'disabled'] }, then: 'alert' },
    ],
    else: 'neutral',
  },
});

export const statusTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'open'] }, then: 'warn' },
      { when: { $eq: [value, 'resolved'] }, then: 'good' },
      { when: { $eq: [value, 'done'] }, then: 'good' },
    ],
    else: 'neutral',
  },
});

export const severityTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'high'] }, then: 'alert' },
      { when: { $eq: [value, 'normal'] }, then: 'warn' },
    ],
    else: 'neutral',
  },
});

export const roomStatusText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'inspected'] }, then: 'Ready' },
      { when: { $eq: [value, 'clean'] }, then: 'Clean' },
      { when: { $eq: [value, 'dirty'] }, then: 'To turn' },
      { when: { $eq: [value, 'out_of_order'] }, then: 'Out of order' },
    ],
    else: value,
  },
});

export const roomStatusTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'inspected'] }, then: 'good' },
      { when: { $eq: [value, 'dirty'] }, then: 'warn' },
      { when: { $eq: [value, 'out_of_order'] }, then: 'alert' },
    ],
    else: 'neutral',
  },
});

export const sinceText = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $lt: [value, 1] }, then: 'just now' },
      { when: { $lt: [value, 60] }, then: { $join: { parts: [{ $round: { value, digits: 0 } }, 'm'], sep: '' } } },
      { when: { $lt: [value, 2880] }, then: { $join: { parts: [{ $round: { value: { $div: [value, 60] }, digits: 0 } }, 'h'], sep: '' } } },
    ],
    else: { $join: { parts: [{ $round: { value: { $div: [value, 1440] }, digits: 0 } }, 'd'], sep: '' } },
  },
});

export const stateTone = (value: unknown) => ({
  $case: {
    branches: [
      { when: { $eq: [value, 'in_house'] }, then: 'good' },
      { when: { $eq: [value, 'arriving'] }, then: 'accent' },
      { when: { $eq: [value, 'departed'] }, then: 'neutral' },
    ],
    else: 'neutral',
  },
});
