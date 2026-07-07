// The company entity — three actions and their read/write prism seams.
//
//   companies     — the collection (list)
//   company       — the single company (profile, in the detail rail)
//   company.form  — create AND edit (one action; the `upsert` mutation desugars insert/update by `id`)
export { companiesAction } from './companies.action';
export { companyAction } from './company.action';
export { companyFormAction } from './company.form.action';

// Ray's `find_records` reuses the list prism (the only one needed outside the domain).
export { listCompaniesPrism } from './companies.prism';
