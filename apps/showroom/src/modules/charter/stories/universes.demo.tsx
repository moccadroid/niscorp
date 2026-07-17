import { CharterLab } from '@showroom/modules/charter/charter-lab';

// Universe-blindness: the SAME engine resolves two different universes. The
// `actions` section selects Nova action ids; the `data` section selects
// `table.verb` capabilities (vex's dialect). The engine never learns what
// either string means — it globs over opaque ids. `sales` reads everything
// and writes the CRM entities; delete is the admin's verb.
const charter = {
  viewer: { actions: ['crm.*.view'], data: ['*.read'] },
  sales: {
    extends: ['viewer'],
    actions: ['crm.*'],
    data: ['deals.write.insert', 'deals.write.update', 'contacts.write.insert', 'contacts.write.update'],
  },
  admin: { extends: ['sales'], data: ['deals.write.delete', 'contacts.write.delete'] },
};

const actions = ['crm.contact.view', 'crm.deal.view', 'crm.contact.form', 'crm.deal.form'];
const data = [
  'deals.read', 'contacts.read',
  'deals.write.insert', 'deals.write.update', 'deals.write.delete',
  'contacts.write.insert', 'contacts.write.update', 'contacts.write.delete',
];

export const Demo = () => <CharterLab charter={charter} actions={actions} data={data} initialRoles={['sales']} />;
