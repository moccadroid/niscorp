import { taskUpsert } from '@relay/app/vex/tasks.entries';

// '' is not a valid DATE or foreign key, so an empty `due` or `deal_id` is sent
// as null. The form's `priority` has no column and is not sent.
const emptyToNull = (path: string) => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null } });

export const upsertTaskPrism = {
  fingerprint: taskUpsert.fingerprint,
  context: {
    title: { $ref: '$.title' },
    due_date: emptyToNull('$.due'),
    deal_id: emptyToNull('$.deal_id'),
    id: { $ref: '$.id' },
  },
};
