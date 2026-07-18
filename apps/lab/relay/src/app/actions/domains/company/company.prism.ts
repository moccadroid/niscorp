import { companyById } from '@relay/app/vex/companies.entries';
import { contactsByCompany } from '@relay/app/vex/contacts.entries';
import { dealsByCompany } from '@relay/app/vex/deals.entries';

// The company profile is three reads into top-level slots — record, people, open
// deals. Each prism is a full Vex query body, attached to an endpoint's `request`.
// (No company-level activity feed: every activity is logged against a deal or
// contact; the company's "activity" is just its deals' feeds.)
export const companyByIdPrism = { fingerprint: companyById.fingerprint, context: { id: { $ref: '$.id' } } };
export const companyContactsPrism = { fingerprint: contactsByCompany.fingerprint, context: { companyId: { $ref: '$.id' } } };
export const companyDealsPrism = { fingerprint: dealsByCompany.fingerprint, context: { companyId: { $ref: '$.id' } } };
