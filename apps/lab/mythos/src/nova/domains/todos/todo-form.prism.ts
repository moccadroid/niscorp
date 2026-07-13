// Request body for create and update alike, shaped from the form's data.
// The empty string a cleared date input leaves behind becomes the null the
// write contract wants (rule 5: dynamic bodies are Prism, in a .prism.ts).
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
