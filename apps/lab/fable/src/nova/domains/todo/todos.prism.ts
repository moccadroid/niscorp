import { todosOpen, todosToday, todosDone, todoStats } from '@fable/api/todos';

// `$.today` is not action data: the shell's `transform` folds it into every
// prism source.
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

export const statsTodosPrism = {
  fingerprint: todoStats.fingerprint,
  context: { today: { $ref: '$.today' } },
};

export const setDoneTodoPrism = {
  todo_id: { $ref: '$.toggleId' },
  done: { $ref: '$.toggleDone' },
};

export const deleteTodoPrism = {
  todo_id: { $ref: '$.pendingDeleteId' },
};
