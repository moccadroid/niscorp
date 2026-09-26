import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { CHARTER, WEARABLE } from './charter/charter';
import { ACTIONS } from './action-catalog';
import { ENTRIES } from './vex';
import { CANVASES } from './shell/canvases';
import { frameLayout } from './shell/frame.layout';

// The manifest. Artifacts are imported here; the two code seams — who a
// principal is, and the server functions — are handed in by the server, which
// is the only place code lives (PLAN.md, build rules). There is no reactions
// seam: the room's reads are reactive, so no write has to be announced.
export type LyceumSeams = {
  identity: NonNullable<NiscApp['identity']>;
  functions: NonNullable<NiscApp['functions']>;
};

export const buildLyceum = (seams: LyceumSeams): NiscApp =>
  defineApp({
    charter: CHARTER,
    wearable: WEARABLE,
    actions: ACTIONS,
    entries: ENTRIES,
    identity: seams.identity,
    functions: seams.functions,
    shell: {
      canvases: CANVASES,
      layout: frameLayout,
    },
  });
