import type { CacheEntry } from './index';
import type { MutationEntry } from './index';

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

export const companyUpsert: MutationEntry = {
  fingerprint: 'companies/upsert',
  intent: 'Create a company, or edit one by id',
  mutation: {
    op: 'upsert',
    table: 'companies',
    key: 'id',
    columns: {
      name: { $context: 'name' },
      domain: { $context: 'domain' },
      industry: { $context: 'industry' },
      size: { $context: 'size' },
    },
  },
};

export const companyDelete: MutationEntry = {
  fingerprint: 'companies/delete',
  intent: 'Delete a company by id (cascades its contacts and deals)',
  mutation: {
    op: 'delete',
    table: 'companies',
    where: { eq: ['companies.id', { $context: 'id' }] },
  },
};
