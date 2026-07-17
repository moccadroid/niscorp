import { CharterLab } from '@showroom/modules/charter/charter-lab';

// The basic resolution: three roles over one universe of action ids. Click a
// role to add/remove it from the principal and watch the granted set (the
// highlighted ids) recompute. The dimmed ids are ungranted — for this
// principal they do not exist. `sales` extends `viewer`, so it inherits the
// read screens and adds the write actions.
const charter = {
  viewer: ['home', 'crm.contacts', 'crm.*.view'],
  sales: { extends: ['viewer'], allow: ['crm.*'], deny: ['crm.*.delete'] },
  admin: { extends: ['sales'], allow: ['crm.*.delete', 'settings'] },
};

const actions = [
  'home', 'settings',
  'crm.contacts', 'crm.deals',
  'crm.contact.view', 'crm.deal.view',
  'crm.contact.form', 'crm.deal.form',
  'crm.contact.delete', 'crm.deal.delete',
];

export const Demo = () => <CharterLab charter={charter} actions={actions} initialRoles={['sales']} />;
