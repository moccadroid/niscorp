import { todosOpen, todosToday, todosDone, todoStats } from '@fable/api/todos';

// Read/write seams for the todos collection — each a full request body,
// attached to an endpoint's `request`. (Query → { fingerprint, context };
// write → the handler's Zod-contracted body.) `$.today` is ambient, folded
// into the source by the shell's transform socket — never per-action data.

// The list, scoped by the toolbar tab (`$.scope`): each scope replays its own
// prewarmed entry — picking the fingerprint picks the query. `q` widens the
// search text for `ilike`.
export const listTodosPrism = {
  fingerprint: {
    $case: {
      branches: [
        { when: { $eq: [{ $ref: '$.scope' }, 'today'] }, then: todosToday.fingerprint },
        { when: { $eq: [{ $ref: '$.scope' }, 'done'] }, then: todosDone.fingerprint },
      ],
      else: todosOpen.fingerprint,
    },
  },
  context: {
    today: { $ref: '$.today' },
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
  },
};

// The stat row — needs `today` for the due-today / overdue counts.
export const statsTodosPrism = {
  fingerprint: todoStats.fingerprint,
  context: { today: { $ref: '$.today' } },
};

// Set-done write: the inline checkbox stashes which todo + the new done flag
// flat (`toggleId`/`toggleDone`); map them to the handler's body.
export const setDoneTodoPrism = {
  todo_id: { $ref: '$.toggleId' },
  done: { $ref: '$.toggleDone' },
};

// Delete the pending todo (id stashed by the ⋯ → Delete).
export const deleteTodoPrism = {
  todo_id: { $ref: '$.pendingDeleteId' },
};
