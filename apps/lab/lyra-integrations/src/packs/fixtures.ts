import type { Pack } from '../pack';

// ── BUNDLES SERVED IN ORDER TO BE REFUSED ────────────────────
//
// Intake is the only thing standing between a mistake here and a corrupted
// application over there, and a gate nobody has watched refuse anything is a
// gate nobody knows the shape of. These two exist so the host's refusals are
// exercised by something real rather than described in a comment.
//
// They are packs like any other — a fixture that took a different path through
// the mounting machinery would stop testing the machinery.

// Three refusals in one payload: a namespace it does not own, a component the
// host cannot render, and a fingerprint the host does not serve.
export const brokenPack: Pack = {
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

// `/hook/` requires no principal. A pack declaring an ACTION endpoint there
// would be a screen's call riding the unauthenticated path — the whole point of
// reserving it.
export const hookClaimPack: Pack = {
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
