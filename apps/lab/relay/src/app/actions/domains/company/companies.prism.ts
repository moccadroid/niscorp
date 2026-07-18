import { companiesList, companyDelete } from '@relay/app/vex/companies.entries';

// Prisms for the companies list — each is a full Vex request body, attached to an
// endpoint's `request`. (Query → { fingerprint, context }; write → { mutation, context }.)

// List companies (search + sort).
export const listCompaniesPrism = {
  fingerprint: companiesList.fingerprint,
  context: {
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

// Delete the pending company (id stashed in `$.pendingDeleteId` by the ⋯ → Delete).
export const deleteCompanyPrism = {
  fingerprint: companyDelete.fingerprint,
  context: { id: { $ref: '$.pendingDeleteId' } },
};
