import { CharterLab } from '@showroom/modules/charter/charter-lab';

// Two more refusals the grammar deliberately delegates to the verifier.
// `manager` sets BOTH the top-level `allow` sugar AND an explicit `actions:`
// selection — resolution would silently drop one, so it is the
// `ambiguous-selection` error. And `crm.deal.form` is granted by no role at
// all: an `orphan` warning — deployed but unreachable.
const charter = {
  viewer: ['crm.deal.view'],
  manager: { allow: ['crm.deals'], actions: ['crm.contacts'] },
};

const actions = ['crm.deals', 'crm.contacts', 'crm.deal.view', 'crm.deal.form'];

export const Demo = () => <CharterLab charter={charter} actions={actions} initialRoles={['viewer', 'manager']} />;
