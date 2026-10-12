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

export type LyceumSeams = {
  features: NonNullable<NiscApp['features']>;
  identity: NonNullable<NiscApp['identity']>;
  functions: NonNullable<NiscApp['functions']>;
  reactions: NonNullable<NiscApp['reactions']>;
  inputs: NonNullable<NiscApp['shell']>['inputs'];
  seeds: NonNullable<NiscApp['shell']>['seeds'];
  onSession: NonNullable<NiscApp['onSession']>;
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
    features: seams.features,
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
