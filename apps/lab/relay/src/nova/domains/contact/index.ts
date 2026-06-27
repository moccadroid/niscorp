// The contact entity — three actions and their read/write prism seams.
//
//   contacts      — the collection (list)
//   contact       — the single contact (profile, in the detail rail)
//   contact.form  — create AND edit (one action; the `upsert` mutation desugars insert/update by `id`)
//
// The form's company picker uses the shared `options.companies` read (registered
// by the deal entity); only its write seam lives here.
export { contactsAction } from './contacts.action';
export { contactAction } from './contact.action';
export { contactFormAction } from './contact.form.action';

export { contactsReads } from './contacts.prism';
export { contactReads } from './contact.prism';
export { contactFormMutations } from './contact.form.prism';
