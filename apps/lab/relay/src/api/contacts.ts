import type { CacheEntry } from './index';
import type { Mutation } from '@relay/vex/mutations';

// Contacts list — `contact_id` and the company name are aliased in the DSL (so
// the array shape is distinct and the joined name doesn't collide). `phone` is
// carried (not shown in the table) so a row's ⋯ → Edit can seed the form without
// a second read. The mapping builds the shape explicitly and nests the company.
export const contactsList: CacheEntry = {
  intent: 'List all contacts with the company each belongs to',
  shape: [{ contact_id: '', name: '', title: '', email: '', phone: '', company: { company_id: '', name: '' } }],
  dsl: {
    from: ['contacts', 'companies'],
    fields: [
      { field: 'contacts.id', as: 'contact_id' },
      'contacts.title',
      'contacts.email',
      'contacts.phone',
      'contacts.company_id',
      { field: 'companies.name', as: 'company_name' },
    ],
    compute: { name: { concat: ['contacts.first_name', ' ', 'contacts.last_name'] } },
    filter: {
      or: [
        { ilike: ['contacts.first_name', { $context: 'q' }] },
        { ilike: ['contacts.last_name', { $context: 'q' }] },
        { ilike: ['contacts.email', { $context: 'q' }] },
        { ilike: ['companies.name', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'contacts.last_name', dir: 'asc' }],
    limit: 200,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        contact_id: { $get: { from: { $var: 'r' }, path: ['contact_id'] } },
        name: { $get: { from: { $var: 'r' }, path: ['name'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        email: { $get: { from: { $var: 'r' }, path: ['email'] } },
        phone: { $get: { from: { $var: 'r' }, path: ['phone'] } },
        company: {
          company_id: { $get: { from: { $var: 'r' }, path: ['company_id'] } },
          name: { $get: { from: { $var: 'r' }, path: ['company_name'] } },
        },
      },
    },
  },
};

// One contact by id — an object shape, so Vex maps the single row: the mapping
// reads `$.result.field` (no index). Reused by the deal modal.
export const contactById: CacheEntry = {
  intent: 'Load one contact by id, with the company nested',
  shape: { contact_id: '', name: '', title: '', email: '', phone: '', company: { company_id: '', name: '' } },
  dsl: {
    from: ['contacts', 'companies'],
    fields: [
      { field: 'contacts.id', as: 'contact_id' },
      'contacts.title',
      'contacts.email',
      'contacts.phone',
      'contacts.company_id',
      { field: 'companies.name', as: 'company_name' },
    ],
    compute: { name: { concat: ['contacts.first_name', ' ', 'contacts.last_name'] } },
    filter: { eq: ['contacts.id', { $context: 'id' }] },
    limit: 1,
  },
  mapping: {
    contact_id: { $ref: '$.result.contact_id' },
    name: { $ref: '$.result.name' },
    title: { $ref: '$.result.title' },
    email: { $ref: '$.result.email' },
    phone: { $ref: '$.result.phone' },
    company: { company_id: { $ref: '$.result.company_id' }, name: { $ref: '$.result.company_name' } },
  },
};

// A company's contacts — flat, all keys aliased/computed to the shape, so the
// rows ARE the shape: no mapping.
export const contactsByCompany: CacheEntry = {
  intent: "List a company's contacts",
  shape: [{ contact_id: '', name: '', title: '', email: '' }],
  dsl: {
    from: ['contacts'],
    fields: [{ field: 'contacts.id', as: 'contact_id' }, 'contacts.title', 'contacts.email'],
    compute: { name: { concat: ['contacts.first_name', ' ', 'contacts.last_name'] } },
    filter: { eq: ['contacts.company_id', { $context: 'companyId' }] },
    sort: [{ field: 'contacts.last_name', dir: 'asc' }],
    limit: 100,
  },
};

// Create a contact. `first_name`/`last_name` are the NOT NULL columns the list
// concatenates back into `name` (the input prism splits the form's single
// "Name"). `owner_id` is NOT here — the engine stamps identity from the scope
// policy. `id`/`created_at` default in the DB. (No company yet — that needs an
// id-bearing company picker.)
export const contactCreate: Mutation = {
  op: 'insert',
  table: 'contacts',
  values: {
    first_name: { $context: 'first_name' },
    last_name: { $context: 'last_name' },
    email: { $context: 'email' },
    phone: { $context: 'phone' },
    title: { $context: 'title' },
    company_id: { $context: 'company_id' },
  },
};

// Edit a contact (the detail's Edit button seeds the form from the open record).
// Same columns as create + the `id` for the WHERE. `owner_id` is not touched —
// editing doesn't reassign ownership.
export const contactUpdate: Mutation = {
  op: 'update',
  table: 'contacts',
  set: {
    first_name: { $context: 'first_name' },
    last_name: { $context: 'last_name' },
    email: { $context: 'email' },
    phone: { $context: 'phone' },
    title: { $context: 'title' },
    company_id: { $context: 'company_id' },
  },
  where: { eq: ['contacts.id', { $context: 'id' }] },
};

// Delete a contact by id (the row ⋯ → Delete, behind a confirm). The schema's
// FKs SET NULL the soft references (a deal's primary contact, activities, tasks)
// and CASCADE owned rows (list memberships), so the delete never FK-fails.
export const contactDelete: Mutation = {
  op: 'delete',
  table: 'contacts',
  where: { eq: ['contacts.id', { $context: 'id' }] },
};
