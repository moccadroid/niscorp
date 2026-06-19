// Input seam for `task.create`: maps the new-task form's data to the mutation's
// DB-column context. The form's "Due date" (`due`) becomes the `due_date` column,
// coerced to null when empty (an empty string is not a valid DATE); "Priority"
// has no column and is dropped. `deal_id` is set when the task is added from a
// deal (else '', coerced to null — '' isn't a valid FK). Action shape ≠ DB shape.
const emptyToNull = (path: string) => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null } });

export const newTaskPrism: Record<string, unknown> = {
  'task.create': {
    title: { $ref: '$.title' },
    due_date: emptyToNull('$.due'),
    deal_id: emptyToNull('$.deal_id'),
  },
  // Edit (the form doubles as edit-task): title + due, plus the `id` for the
  // WHERE. `deal_id` is left as-is (not re-linked from the edit form).
  'task.update': {
    title: { $ref: '$.title' },
    due_date: emptyToNull('$.due'),
    id: { $ref: '$.id' },
  },
};
