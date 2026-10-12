export const todoPayloadRequest = {
  title: { $trim: { $ref: '$.title' } },
  notes: { $ref: '$.notes' },
  due_date: {
    $case: {
      branches: [{ when: { $empty: { $ref: '$.due_date' } }, then: { $const: null } }],
      else: { $ref: '$.due_date' },
    },
  },
};
