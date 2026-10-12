import { contactUpsert } from '@relay/app/vex/contacts.entries';

// first_name and last_name are NOT NULL, so a single-word name gives last_name ''.
const fromName = (i: 0 | 1) => ({ $get: { from: { $split: { value: { $ref: '$.name' }, sep: ' ' } }, path: [i], fallback: '' } });
const emptyToNull = (path: string) => ({ $case: { branches: [{ when: { $ref: path }, then: { $ref: path } }], else: null } });
const fields = {
  first_name: fromName(0),
  last_name: fromName(1),
  email: { $ref: '$.email' },
  phone: { $ref: '$.phone' },
  title: { $ref: '$.title' },
  company_id: emptyToNull('$.company'),
};

export const upsertContactPrism = {
  fingerprint: contactUpsert.fingerprint,
  context: { ...fields, id: { $ref: '$.id' } },
};
