import { CharterLab } from '@showroom/modules/charter/charter-lab';

// The verifier refuses. `sales` denies `crm.*.delete`, but the universe has
// no delete actions — the deny matches nothing. A dead DENY is an ERROR, not
// a warning: a typo'd deny fails silent, and a silent deny means something
// the author believed protected is not. Boot refuses this charter. (The dead
// ALLOW below is only a warning — it grants nothing, so it is noise.)
const charter = {
  sales: { allow: ['crm.*', 'reports.export'], deny: ['crm.*.destroy'] },
};

const actions = ['crm.deals', 'crm.contacts', 'crm.deal.view'];

export const Demo = () => <CharterLab charter={charter} actions={actions} />;
