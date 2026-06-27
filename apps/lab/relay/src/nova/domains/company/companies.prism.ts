import { companiesList } from '@relay/api/companies';

export const companiesReads: Record<string, unknown> = {
  'companies.list': {
    shape: { $const: companiesList.shape },
    context: {
      q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
      sortBy: { $ref: '$.sortBy' },
      sortDir: { $ref: '$.sortDir' },
    },
  },
};
