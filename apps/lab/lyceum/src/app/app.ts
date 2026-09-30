import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { CHARTER, WEARABLE } from './charter/charter';
import { ACTIONS } from './action-catalog';
import { ENTRIES } from './vex';
import { BEHAVIORS } from './vex/behaviors';
import { CANVASES } from './shell/canvases';
import { frameLayout } from './shell/frame.layout';
import { FRAGMENTS } from './shell/fragments/sheet.fragment';
import { LYCEUM_KIT } from './grammars';

// The manifest. Artifacts are imported here; the code seams — who a principal
// is, the server functions, the one signal that is not data (the deck moving
// on), and the phone's tabs composed from what a person is granted — are
// handed in by the server, which is the only place code
// lives (PLAN.md, build rules). The room's reads are reactive; nothing else is
// announced.
export type LyceumSeams = {
  identity: NonNullable<NiscApp['identity']>;
  functions: NonNullable<NiscApp['functions']>;
  reactions: NonNullable<NiscApp['reactions']>;
  seeds: NonNullable<NiscApp['shell']>['seeds'];
};

export const buildLyceum = (seams: LyceumSeams): NiscApp =>
  defineApp({
    charter: CHARTER,
    wearable: WEARABLE,
    actions: ACTIONS,
    entries: ENTRIES,
    behaviors: BEHAVIORS,
    grammars: [LYCEUM_KIT],
    identity: seams.identity,
    functions: seams.functions,
    reactions: seams.reactions,
    shell: {
      canvases: CANVASES,
      layout: frameLayout,
      fragments: FRAGMENTS,
      seeds: seams.seeds,
    },
  });
