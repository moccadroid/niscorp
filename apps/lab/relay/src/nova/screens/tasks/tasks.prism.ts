import { tasksMine, tasksOverdue } from '@relay/api/tasks';

// The tasks list, scoped by the toolbar tab (`$.scope`): 'overdue' reads the
// dedicated overdue entry (due before the injected `$.today`); 'open' / 'done' /
// 'all' all read `tasksMine` (same shape → same cached plan) and differ only by
// the `done` RANGE — doneMin/doneMax bound the boolean so it collapses to
// false-only / true-only / both. `$.userId`/`$.today` are reader-injected.
export const tasksPrism: Record<string, unknown> = {
  'tasks.mine': {
    shape: {
      $case: {
        branches: [{ when: { $eq: [{ $ref: '$.scope' }, 'overdue'] }, then: { $const: tasksOverdue.shape } }],
        else: { $const: tasksMine.shape },
      },
    },
    context: {
      userId: { $ref: '$.userId' },
      today: { $ref: '$.today' },
      q: { $join: { parts: ['%', { $ref: '$.q' }, '%'], sep: '' } },
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
  },
};

// Mutation input seam: the inline checkbox stashes which task + the new done flag
// flat (`toggleId`/`toggleDone`); map them to `task.setDone`. Shared by every
// task list (tasks screen, deal modal, contact panel) — they all use this convention.
export const taskMutations: Record<string, unknown> = {
  'task.setDone': { id: { $ref: '$.toggleId' }, done: { $ref: '$.toggleDone' } },
};
