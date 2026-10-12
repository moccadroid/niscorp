const emptyToNull = (path: string) => ({
  $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null },
});

export const saveTodoPrism = {
  todo_id: emptyToNull('$.id'),
  title: { $ref: '$.title' },
  notes: emptyToNull('$.notes'),
  priority: { $ref: '$.priority' },
  due_date: emptyToNull('$.due'),
};
