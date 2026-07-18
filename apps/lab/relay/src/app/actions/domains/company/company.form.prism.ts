import { companyUpsert } from '@relay/app/vex/companies.entries';

// Create-or-edit a company → a full Vex write body, attached to the form's `save`
// request. `id` always flows through: the mutation desugars to insert (id empty)
// or update (id set), so the form never picks a write. `owner_id` is server-side
// scope, never here.
const fields = { name: { $ref: '$.name' }, domain: { $ref: '$.domain' }, industry: { $ref: '$.industry' }, size: { $ref: '$.size' } };

export const upsertCompanyPrism = {
  fingerprint: companyUpsert.fingerprint,
  context: { ...fields, id: { $ref: '$.id' } },
};
