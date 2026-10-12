import { companyById } from '@relay/app/vex/companies.entries';
import { contactsByCompany } from '@relay/app/vex/contacts.entries';
import { dealsByCompany } from '@relay/app/vex/deals.entries';

export const companyByIdPrism = { fingerprint: companyById.fingerprint, context: { id: { $ref: '$.id' } } };
export const companyContactsPrism = { fingerprint: contactsByCompany.fingerprint, context: { companyId: { $ref: '$.id' } } };
export const companyDealsPrism = { fingerprint: dealsByCompany.fingerprint, context: { companyId: { $ref: '$.id' } } };
