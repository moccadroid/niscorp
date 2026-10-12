import { dealUpsert } from '@relay/app/vex/deals.entries';

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
