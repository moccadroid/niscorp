import { defineApp } from '@niscorp/moss';
import type { NiscApp, RunSink } from '@niscorp/moss';
import { CHARTER } from './charter/charter';
import { ASSIGNMENTS } from './charter/assignments';
import { CATALOG_DEFINITIONS } from './action-catalog';
import { ENTRIES } from './vex';
import { scopeBehaviors } from './vex/behaviors';
import { RESOURCES } from './vex/resources';
import { writtenTables } from './reload-on-write';
import { CANVASES } from './shell/canvases';
import { frameLayout, ROOM_REF } from './shell/frame.layout';
import { calmLayout } from './shell/calm.layout';
import { PLACED_FRAGMENT, placedFragment } from './shell/fragments/placed.fragment';
import { RAISED_FRAGMENT, raisedFragment } from './shell/fragments/raised.fragment';
import type { IntentLoops } from '@encore/server/intent/functions';

export const buildEncore = (loops: IntentLoops, runs: RunSink): NiscApp =>
  defineApp({
    charter: CHARTER,
    assignments: ASSIGNMENTS,
    actions: CATALOG_DEFINITIONS,
    entries: ENTRIES,
    behaviors: scopeBehaviors,
    resources: RESOURCES,

    functions: (session) => loops.functionsFor(session),

    runs,

    // moss says that a table was written, never what: every live session re-reads
    // under its own policy, so nobody is shown a row they cannot read.
    reactions: writtenTables(ENTRIES).map((table) => ({ table, run: () => loops.notifyFeed(table) })),

    shell: {
      canvases: CANVASES,
      layout: frameLayout,
      layoutStore: { [ROOM_REF]: calmLayout },
      fragments: { [PLACED_FRAGMENT]: placedFragment, [RAISED_FRAGMENT]: raisedFragment },
    },
  });
