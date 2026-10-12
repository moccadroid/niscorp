import { tasksMine, tasksOverdue, taskSetDone, taskDelete } from '@relay/app/vex/tasks.entries';

export const listTasksPrism = {
  fingerprint: {
    $case: {
      branches: [{ when: { $eq: [{ $ref: '$.scope' }, 'overdue'] }, then: tasksOverdue.fingerprint }],
      else: tasksMine.fingerprint,
    },
  },
  context: {
    userId: { $ref: '$.userId' },
    today: { $ref: '$.today' },
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    // `done` is bounded as a range so one query serves every tab:
    // open/overdue → [false,false], done → [true,true], all → [false,true]
    doneMin: { $case: { branches: [{ when: { $eq: [{ $ref: '$.scope' }, 'done'] }, then: true }], else: false } },
    doneMax: {
      $case: {
        branches: [
          { when: { $eq: [{ $ref: '$.scope' }, 'done'] }, then: true },
          { when: { $eq: [{ $ref: '$.scope' }, 'all'] }, then: true },
        ],
        else: false,
      },
    },
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

export const setDoneTaskPrism = {
  fingerprint: taskSetDone.fingerprint,
  context: { id: { $ref: '$.toggleId' }, done: { $ref: '$.toggleDone' } },
};

export const deleteTaskPrism = {
  fingerprint: taskDelete.fingerprint,
  context: { id: { $ref: '$.pendingDeleteId' } },
};
