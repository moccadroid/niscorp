import { dealUpsert } from '@relay/app/vex/deals.entries';

// The deal form's write seam. (The three picker reads take no caller input —
// they're plain JSON bodies in the action files, not seams.)
//
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
  fingerprint: dealUpsert.fingerprint,
  context: { ...fields, id: { $ref: '$.id' } },
};
