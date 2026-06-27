import { companyOptions, stageOptions, contactOptions } from '@relay/api/deals';

// Read seam: the form's pickers load real id/name options on mount.
export const dealFormReads: Record<string, unknown> = {
  'options.companies': { shape: { $const: companyOptions.shape }, context: {} },
  'options.stages': { shape: { $const: stageOptions.shape }, context: {} },
  'options.contacts': { shape: { $const: contactOptions.shape }, context: {} },
};

// Mutation input seam for the deal `upsert`: map the form's data → the deal
// columns. `company`/`stage`/`contact` already hold real FK ids (the selects'
// values); empties coerce — value → 0, FK/date → null. `id` always flows
// through, so the mutation desugars to insert (id empty) or update (id set).
const emptyToNull = (path: string) => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null } });
const fields = {
  title: { $ref: '$.title' },
  company_id: emptyToNull('$.company'),
  stage_id: { $ref: '$.stage' },
  primary_contact_id: emptyToNull('$.contact'),
  value: { $case: { branches: [{ when: { $ref: '$.value' }, then: { $ref: '$.value' } }], else: 0 } },
  close_date: emptyToNull('$.close_date'),
};

export const dealFormMutations: Record<string, unknown> = {
  'deal.upsert': { ...fields, id: { $ref: '$.id' } },
};
