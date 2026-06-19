// Input seam for the company mutations (create + edit). Maps the company form's
// data to DB-column context. The form happens to use the same field names —
// coincidence, not coupling; the prism is the seam regardless, and `owner_id` is
// injected server-side via scope, never here. `update` adds the `id` for the WHERE.
const fields = { name: { $ref: '$.name' }, domain: { $ref: '$.domain' }, industry: { $ref: '$.industry' }, size: { $ref: '$.size' } };

export const newCompanyPrism: Record<string, unknown> = {
  'company.create': fields,
  'company.update': { ...fields, id: { $ref: '$.id' } },
};
