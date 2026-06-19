import type { CacheEntry } from './index';
import type { Mutation } from '@relay/vex/mutations';

// Companies list — `company_id` aliased so the array shape is distinct; the rows
// already match the shape, so no mapping.
export const companiesList: CacheEntry = {
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

// Create a company. The form's values arrive via `$context` (shaped by the
// input prism). `owner_id` is NOT here: identity is stamped by the engine from
// the scope policy, never authored in the DSL. `id`/`created_at` default in the DB.
export const companyCreate: Mutation = {
  op: 'insert',
  table: 'companies',
  values: {
    name: { $context: 'name' },
    domain: { $context: 'domain' },
    industry: { $context: 'industry' },
    size: { $context: 'size' },
  },
};

// Edit a company (the detail's Edit button seeds the form from the open record).
// Same columns + the `id` for the WHERE; `owner_id` is left as-is.
export const companyUpdate: Mutation = {
  op: 'update',
  table: 'companies',
  set: {
    name: { $context: 'name' },
    domain: { $context: 'domain' },
    industry: { $context: 'industry' },
    size: { $context: 'size' },
  },
  where: { eq: ['companies.id', { $context: 'id' }] },
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
