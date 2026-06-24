import { companyById } from '@relay/api/companies';
import { contactsByCompany } from '@relay/api/contacts';
import { dealsByCompany } from '@relay/api/deals';

// The company profile is three reads into slots of `$.view` — record, people, open
// deals. (No company-level activity feed: every activity is logged against a deal
// or contact; the company's "activity" is just its deals' feeds, which you see in
// each deal — surfacing it here only duplicates them.) The layout binds the slots.
export const companyReads: Record<string, unknown> = {
  'company.byId': { shape: { $const: companyById.shape }, context: { id: { $ref: '$.id' } } },
  'company.contacts': { shape: { $const: contactsByCompany.shape }, context: { companyId: { $ref: '$.id' } } },
  'company.deals': { shape: { $const: dealsByCompany.shape }, context: { companyId: { $ref: '$.id' } } },
};
