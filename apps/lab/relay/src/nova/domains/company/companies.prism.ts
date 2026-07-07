import { companiesList, companyDelete } from '@relay/api/companies';

// Prisms for the companies list — each is a full Vex request body, attached to an
// endpoint's `request`. (Query → { shape, context }; write → { mutation, context }.)

// List companies (search + sort).
export const listCompaniesPrism = {
  shape: { $const: companiesList.shape },
  context: {
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

// Delete the pending company (id stashed in `$.pendingDeleteId` by the ⋯ → Delete).
export const deleteCompanyPrism = {
  mutation: { $const: companyDelete },
  context: { id: { $ref: '$.pendingDeleteId' } },
};
