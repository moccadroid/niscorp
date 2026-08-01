import { tasksAssigned, taskSetStatus } from '@atrium/app/vex/service.entries';

// Status as a RANGE, the same trick the desk board uses on issues: 'done' sorts
// before 'open' in Postgres text order, so one cached plan serves all three
// tabs by moving the bounds.
export const myTasksPrism = {
  fingerprint: tasksAssigned.fingerprint,
  context: {
    staffId: { $ref: '$.staffId' },
    statusMin: { $case: { branches: [{ when: { $eq: [{ $ref: '$.scope' }, 'open'] }, then: 'open' }], else: 'done' } },
    statusMax: { $case: { branches: [{ when: { $eq: [{ $ref: '$.scope' }, 'done'] }, then: 'done' }], else: 'open' } },
  },
};

export const setTaskStatusPrism = {
  fingerprint: taskSetStatus.fingerprint,
  context: { taskId: { $ref: '$.toggleId' }, status: { $ref: '$.toggleStatus' } },
};
