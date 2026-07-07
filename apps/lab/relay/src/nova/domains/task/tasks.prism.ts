import { tasksMine, tasksOverdue, taskSetDone, taskDelete } from '@relay/api/tasks';

// Read/write seams for the tasks collection — each a full Vex request body,
// attached to an endpoint's `request`. (Query → { shape, context }; write →
// { mutation, context }.)
//
// The tasks list, scoped by the toolbar tab (`$.scope`): 'overdue' reads the
// dedicated overdue entry (due before the injected `$.today`); 'open' / 'done' /
// 'all' all read `tasksMine` (same shape → same cached plan) and differ only by
// the `done` RANGE — doneMin/doneMax bound the boolean so it collapses to
// false-only / true-only / both. `$.userId`/`$.today` are reader-injected.
export const listTasksPrism = {
  shape: {
    $case: {
      branches: [{ when: { $eq: [{ $ref: '$.scope' }, 'overdue'] }, then: { $const: tasksOverdue.shape } }],
      else: { $const: tasksMine.shape },
    },
  },
  context: {
    userId: { $ref: '$.userId' },
    today: { $ref: '$.today' },
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    // done range: open/overdue → [false,false], done → [true,true], all → [false,true]
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
    // Vex's reserved sort keys — the table header forwards them (default due asc).
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

// Set-done write: the inline checkbox stashes which task + the new done flag flat
// (`toggleId`/`toggleDone`); map them to `task.setDone`. Shared by every task list
// (tasks screen, deal modal, contact panel) — they all use this convention, so
// deal.action and contact.action import this prism directly.
export const setDoneTaskPrism = {
  mutation: { $const: taskSetDone },
  context: { id: { $ref: '$.toggleId' }, done: { $ref: '$.toggleDone' } },
};

// Delete the pending task (id stashed in `$.pendingDeleteId` by the ⋯ → Delete).
export const deleteTaskPrism = {
  mutation: { $const: taskDelete },
  context: { id: { $ref: '$.pendingDeleteId' } },
};
