import { CharterLab } from '@showroom/modules/charter/charter-lab';

// Deny wins within a role, and the algebra is set-minus (order-independent).
// `sales` allows the whole `crm.*` namespace, then subtracts `crm.*.delete` —
// so the delete actions stay dimmed even though a broad allow matched them.
// Toggle `admin` on: it re-adds the deletes in its own role (a legal
// composition — denies do not inherit).
const charter = {
  sales: { allow: ['crm.*'], deny: ['crm.*.delete'] },
  admin: { extends: ['sales'], allow: ['crm.*.delete'] },
};

const actions = [
  'crm.deals', 'crm.contacts',
  'crm.deal.view', 'crm.contact.view',
  'crm.deal.delete', 'crm.contact.delete',
];

export const Demo = () => <CharterLab charter={charter} actions={actions} initialRoles={['sales']} />;
