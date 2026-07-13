// The write seam: the form's own data shape → the save endpoint's body
// (TodoSaveBody in @fable/api/todos, parsed .strict() by the handler).
// Action data ≠ DB shape: `due` → `due_date`, empties → null, and a blank
// `id` means create (the handler inserts and the DB mints the id).
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
