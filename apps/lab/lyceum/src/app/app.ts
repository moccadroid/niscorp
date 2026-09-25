import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { CHARTER, WEARABLE } from './charter/charter';
import { ACTIONS } from './action-catalog';
import { ENTRIES } from './vex';
import { CANVASES } from './shell/canvases';
import { frameLayout } from './shell/frame.layout';

// The manifest. Artifacts are imported here; the three code seams — who a
// principal is, the server functions, and what a write announces — are handed
// in by the server, which is the only place code lives (PLAN.md, build rules).
export type LyceumSeams = {
  identity: NonNullable<NiscApp['identity']>;
  functions: NonNullable<NiscApp['functions']>;
  reactions: NonNullable<NiscApp['reactions']>;
};

export const buildLyceum = (seams: LyceumSeams): NiscApp =>
  defineApp({
    charter: CHARTER,
    wearable: WEARABLE,
    actions: ACTIONS,
    entries: ENTRIES,
    identity: seams.identity,
    functions: seams.functions,
    reactions: seams.reactions,
    shell: {
      canvases: CANVASES,
      layout: frameLayout,
    },
  });
