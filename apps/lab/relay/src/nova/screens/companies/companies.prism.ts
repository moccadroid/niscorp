import { companiesList } from '@relay/api/companies';

export const companiesPrism: Record<string, unknown> = {
  'companies.list': {
    shape: { $const: companiesList.shape },
    context: {
      q: { $join: { parts: ['%', { $ref: '$.q' }, '%'], sep: '' } },
      sortBy: { $ref: '$.sortBy' },
      sortDir: { $ref: '$.sortDir' },
    },
  },
};
