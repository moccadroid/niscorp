import { tasksAssigned, taskSetStatus } from '@atrium/app/vex/service.entries';

// The tab is a status range: Postgres orders text and 'done' sorts before
// 'open', so one cached plan serves all three tabs.
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
