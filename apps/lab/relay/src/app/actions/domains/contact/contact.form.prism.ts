import { contactUpsert } from '@relay/app/data/api/contacts';

// Write seam for the contact form — a full Vex write body, attached to the form's
// `save` request. The form collects a single "Name"; the table has first_name /
// last_name (NOT NULL) — split on the first space (single-word names fall back to
// ''). `company` is an FK id (the picker) coerced empty→null. Action shape ≠ DB
// shape; this is where they meet. `id` always flows through; the mutation desugars
// to insert (id empty) or update (id set).
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
