import { taskUpsert } from '@relay/api/tasks';

// Write seam for the task form — a full Vex write body, attached to the form's
// `save` request. The form's "Due date" (`due`) becomes the `due_date` column,
// coerced to null when empty (an empty string is not a valid DATE); "Priority"
// has no column and is dropped. `deal_id` is set when the task is added from a
// deal (else '', coerced to null — '' isn't a valid FK). Action shape ≠ DB shape.
const emptyToNull = (path: string) => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null } });

// One `upsert` seam. All of title/due/deal_id/id flow into context; the mutation
// desugars by `id` — update sets title+due (its `columns`), insert adds the
// `insert`-only `deal_id`, so editing can't re-link or wipe the task's deal.
export const upsertTaskPrism = {
  mutation: { $const: taskUpsert },
  context: {
    title: { $ref: '$.title' },
    due_date: emptyToNull('$.due'),
    deal_id: emptyToNull('$.deal_id'),
    id: { $ref: '$.id' },
  },
};
