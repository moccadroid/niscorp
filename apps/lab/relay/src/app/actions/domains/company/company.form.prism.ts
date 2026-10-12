import { companyUpsert } from '@relay/app/vex/companies.entries';

const fields = { name: { $ref: '$.name' }, domain: { $ref: '$.domain' }, industry: { $ref: '$.industry' }, size: { $ref: '$.size' } };

export const upsertCompanyPrism = {
  fingerprint: companyUpsert.fingerprint,
  context: { ...fields, id: { $ref: '$.id' } },
};
