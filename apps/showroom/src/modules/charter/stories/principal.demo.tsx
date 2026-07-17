import { CharterLab } from '@showroom/modules/charter/charter-lab';

// A principal wears roles; the grant is the UNION of their resolved sets.
// Roles are orthogonal — `admin` does not imply `dev`. Toggle the chips to
// build different principals: `sales`+`dev` is a salesperson with devtools;
// `admin` alone owns the CRM but not the debugging surface. The application a
// person sees IS this resolved set — nothing else is rendered or reachable.
const charter = {
  viewer: ['home', 'crm.*.view'],
  sales: { extends: ['viewer'], allow: ['crm.*'] },
  admin: { extends: ['sales'], allow: ['settings'] },
  dev: ['devtools.dock', 'devtools.inspect'],
};

const actions = [
  'home', 'settings',
  'crm.deals', 'crm.contacts',
  'crm.deal.view', 'crm.contact.view',
  'crm.deal.form', 'crm.contact.form',
  'devtools.dock', 'devtools.inspect',
];

export const Demo = () => <CharterLab charter={charter} actions={actions} initialRoles={['sales', 'dev']} />;
