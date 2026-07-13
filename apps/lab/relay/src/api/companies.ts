import type { CacheEntry } from './index';
import type { Mutation } from '@relay/vex/mutations';

// Companies list — `company_id` aliased so the array shape is distinct; the rows
// already match the shape, so no mapping.
export const companiesList: CacheEntry = {
  fingerprint: 'companies/list',
  intent: 'List all companies with industry and size',
  shape: [{ company_id: '', name: '', domain: '', industry: '', size: '' }],
  dsl: {
    from: ['companies'],
    fields: [{ field: 'companies.id', as: 'company_id' }, 'companies.name', 'companies.domain', 'companies.industry', 'companies.size'],
    filter: {
      or: [
        { ilike: ['companies.name', { $context: 'q' }] },
        { ilike: ['companies.industry', { $context: 'q' }] },
        { ilike: ['companies.domain', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'companies.name', dir: 'asc' }],
    limit: 200,
  },
};

// One company by id — an object shape, so Vex maps the single row. The aliased
// row already matches the shape, so the mapping is identity over that one row.
export const companyById: CacheEntry = {
  fingerprint: 'companies/byId',
  intent: 'Load one company by id',
  shape: { company_id: '', name: '', domain: '', industry: '', size: '' },
  dsl: {
    from: ['companies'],
    fields: [{ field: 'companies.id', as: 'company_id' }, 'companies.name', 'companies.domain', 'companies.industry', 'companies.size'],
    filter: { eq: ['companies.id', { $context: 'id' }] },
    limit: 1,
  },
  mapping: { $ref: '$.result' },
};

// Create-or-edit a company. The form's values arrive via `$context` (shaped by
// the input prism). `upsert` keys on `id`: present → update that row, absent →
// insert (the engine desugars it to update/insert). `owner_id` is NOT here —
// identity is stamped by the engine from the scope policy on the insert branch;
// `id`/`created_at` default in the DB on create.
export const companyUpsert: Mutation = {
  op: 'upsert',
  table: 'companies',
  key: 'id',
  columns: {
    name: { $context: 'name' },
    domain: { $context: 'domain' },
    industry: { $context: 'industry' },
    size: { $context: 'size' },
  },
};

// Delete a company by id (the row ⋯ → Delete, behind a confirm). The schema
// CASCADEs the company's contacts and deals (and, through them, line items) so
// nothing is orphaned behind an INNER join; activities/tasks SET NULL their
// company reference. Destructive — the confirm spells that out.
export const companyDelete: Mutation = {
  op: 'delete',
  table: 'companies',
  where: { eq: ['companies.id', { $context: 'id' }] },
};
