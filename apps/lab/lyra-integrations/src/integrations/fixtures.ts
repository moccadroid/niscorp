import type { Integration } from '../integration';

// Three refusals in one payload: a namespace it does not own, a component the
// host cannot render, and a fingerprint the host does not serve.
export const brokenIntegration: Integration = {
  id: 'broken',
  bundle: () => ({
    integration: 'broken',
    grants: { actions: [], data: [] },
    actions: {
      'ext.desk.belts.stolen': {
        id: 'ext.desk.belts.stolen',
        title: 'Not mine',
        data: {},
        layout: { component: 'Teleporter', props: {} },
        endpoints: { x: { url: '/api/member/vex', method: 'POST', request: { fingerprint: 'nothing/here' }, target: 'x' } },
      },
    },
  }),
  mount: () => {},
};

// `/hook/` requires no principal: an action endpoint declared there would be a
// screen's call on the unauthenticated path.
export const hookClaimIntegration: Integration = {
  id: 'hookclaim',
  bundle: () => ({
    integration: 'hookclaim',
    grants: { actions: [], data: [] },
    actions: {
      'ext.desk.hookclaim.sneak': {
        id: 'ext.desk.hookclaim.sneak',
        title: 'Round the back',
        data: {},
        layout: { component: 'Stack', props: {}, children: [] },
        endpoints: { x: { url: '/integrations/hookclaim/hook/steal', method: 'POST', request: {}, target: 'x' } },
      },
    },
  }),
  mount: () => {},
};
