import type { CacheEntry } from './index';
import type { MutationEntry } from './index';

// `phone` is not shown in the table: the row's Edit seeds the form from it.
export const contactsList: CacheEntry = {
  fingerprint: 'contacts/list',
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

export const contactById: CacheEntry = {
  fingerprint: 'contacts/byId',
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

export const contactsByCompany: CacheEntry = {
  fingerprint: 'contacts/byCompany',
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

export const contactUpsert: MutationEntry = {
  fingerprint: 'contacts/upsert',
  intent: 'Create a contact, or edit one by id',
  mutation: {
    op: 'upsert',
    table: 'contacts',
    key: 'id',
    columns: {
      first_name: { $context: 'first_name' },
      last_name: { $context: 'last_name' },
      email: { $context: 'email' },
      phone: { $context: 'phone' },
      title: { $context: 'title' },
      company_id: { $context: 'company_id' },
    },
  },
};

export const contactDelete: MutationEntry = {
  fingerprint: 'contacts/delete',
  intent: 'Delete a contact by id',
  mutation: {
    op: 'delete',
    table: 'contacts',
    where: { eq: ['contacts.id', { $context: 'id' }] },
  },
};
