import { companiesList, companyDelete } from '@relay/app/vex/companies.entries';

export const listCompaniesPrism = {
  fingerprint: companiesList.fingerprint,
  context: {
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

export const deleteCompanyPrism = {
  fingerprint: companyDelete.fingerprint,
  context: { id: { $ref: '$.pendingDeleteId' } },
};
