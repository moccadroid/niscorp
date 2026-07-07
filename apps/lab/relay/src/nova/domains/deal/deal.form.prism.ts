import { companyOptions, stageOptions, contactOptions, dealUpsert } from '@relay/api/deals';

// Read/write seams for the deal form — each a full Vex request body, attached to
// an endpoint's `request`. The pickers load real id/name options on mount; the
// `contact.form` reuses `companyOptionsPrism` for its own company picker.
export const companyOptionsPrism = { shape: { $const: companyOptions.shape }, context: {} };
export const stageOptionsPrism = { shape: { $const: stageOptions.shape }, context: {} };
export const contactOptionsPrism = { shape: { $const: contactOptions.shape }, context: {} };

// Write seam for the deal `upsert`: map the form's data → the deal columns.
// `company`/`stage`/`contact` already hold real FK ids (the selects' values);
// empties coerce — value → 0, FK/date → null. `id` always flows through, so the
// mutation desugars to insert (id empty) or update (id set).
const emptyToNull = (path: string) => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null } });
const fields = {
  title: { $ref: '$.title' },
  company_id: emptyToNull('$.company'),
  stage_id: { $ref: '$.stage' },
  primary_contact_id: emptyToNull('$.contact'),
  value: { $case: { branches: [{ when: { $ref: '$.value' }, then: { $ref: '$.value' } }], else: 0 } },
  close_date: emptyToNull('$.close_date'),
};

export const upsertDealPrism = {
  mutation: { $const: dealUpsert },
  context: { ...fields, id: { $ref: '$.id' } },
};
