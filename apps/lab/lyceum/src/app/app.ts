import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import { CHARTER, WEARABLE } from './charter/charter';
import { ACTIONS } from './action-catalog';
import { ENTRIES } from './vex';
import { BEHAVIORS } from './vex/behaviors';
import { CANVASES } from './shell/canvases';
import { FRAME_STORE, frameLayout } from './shell/frame.layout';
import { FRAGMENTS } from './shell/fragments/sheet.fragment';
import { LYCEUM_KIT } from './grammars';
import { ATTACHABLE } from './attachable';

// The manifest. Artifacts are imported here; the code seams — who a principal
// is, the server functions, the one signal that is not data (the deck moving
// on), the phone's list derived from what a person is granted, and which
// renderer draws each screen — are
// handed in by the server, which is the only place code
// lives (PLAN.md, build rules). The room's reads are reactive; nothing else is
// announced.
export type LyceumSeams = {
  identity: NonNullable<NiscApp['identity']>;
  functions: NonNullable<NiscApp['functions']>;
  reactions: NonNullable<NiscApp['reactions']>;
  inputs: NonNullable<NiscApp['shell']>['inputs'];
  seeds: NonNullable<NiscApp['shell']>['seeds'];
  onSession: NonNullable<NiscApp['onSession']>;
  // The kit's components and the props each accepts — what an integration's
  // layouts are checked against at intake. Zod schemas, so code: handed in.
  components: NonNullable<NonNullable<NiscApp['shell']>['components']>;
};

export const buildLyceum = (seams: LyceumSeams): NiscApp =>
  defineApp({
    charter: CHARTER,
    wearable: WEARABLE,
    actions: ACTIONS,
    entries: ENTRIES,
    behaviors: BEHAVIORS,
    grammars: [LYCEUM_KIT],
    attachable: ATTACHABLE,
    identity: seams.identity,
    functions: seams.functions,
    reactions: seams.reactions,
    onSession: seams.onSession,
    shell: {
      canvases: CANVASES,
      layout: frameLayout,
      layoutStore: FRAME_STORE,
      fragments: FRAGMENTS,
      inputs: seams.inputs,
      seeds: seams.seeds,
      components: seams.components,
    },
  });
