// Input seam for the company `upsert`. Maps the company form's data to DB-column
// context. `owner_id` is injected server-side via scope, never here. `id` always
// flows through: the mutation desugars to insert (id empty) or update (id set),
// so the form never picks a write.
const fields = { name: { $ref: '$.name' }, domain: { $ref: '$.domain' }, industry: { $ref: '$.industry' }, size: { $ref: '$.size' } };

export const companyFormMutations: Record<string, unknown> = {
  'company.upsert': { ...fields, id: { $ref: '$.id' } },
};
