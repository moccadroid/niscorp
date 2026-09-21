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

// ═══════════════════════════════════════════════════════════
// Encore, the application, as data.
//
// Charter, assignments, actions, entries, behaviors, resources, canvases, a
// frame — every field an authored artifact, and the server derives the rest.
// There is no navigation in this manifest because there is none in the app:
// no action pushes another, no canvas has a back. What is on screen is a
// function of one sentence, computed in `functions` and nowhere else.
//
// It is a function of the loops because those are ENVIRONMENT — they hold the
// decision provider boot chose — and a manifest that reached for one out of
// module scope could not be booted twice in one process, which is exactly what
// the checks do.
// ═══════════════════════════════════════════════════════════
export const buildEncore = (loops: IntentLoops, runs: RunSink): NiscApp =>
  defineApp({
    charter: CHARTER,
    assignments: ASSIGNMENTS,
    actions: CATALOG_DEFINITIONS,
    entries: ENTRIES,
    behaviors: scopeBehaviors,
    resources: RESOURCES,

    // The `fn:` seam: the intent line's endpoint and the chip strip's, built
    // per session so each closes over its own shell, wire and catalog.
    functions: (session) => loops.functionsFor(session),

    // WHERE AGENT RUNS GO. Every run the agent makes — landed, failed, aborted —
    // is handed to `session.recordRun`, and moss stamps who and which shell
    // before it arrives here. The sink is boot's: environment, like the loops.
    runs,

    // THE ROOM WATCHES. Each of these tables is a feed — or, for the last, the
    // operator's own clicks on what the room raised. moss says THAT one was
    // written — table, op, how many rows — and never what: every live session
    // re-reads what changed over its own wire, under its own policy, which is
    // the whole of why somebody who cannot read the incident log is never shown
    // an incident (server/watch/watch.ts).
    //
    // EVERY table a mutation can write is here, derived from the entries: a
    // feed's, and a form's. Each session is told, its watcher re-reads the feeds
    // among them, and its cards that show that table re-read themselves
    // (reload-on-write.ts) — whoever made the write, from wherever.
    reactions: writtenTables(ENTRIES).map((table) => ({ table, run: () => loops.notifyFeed(table) })),

    shell: {
      canvases: CANVASES,
      layout: frameLayout,
      // The frame embeds the room as a `{ ref }`; this is what it resolves to
      // before anything calls `setLayout`. One arrangement ships in this slice.
      layoutStore: { [ROOM_REF]: calmLayout },
      // Chrome composed at mount: every card the loop opens wears `placed`,
      // the one-line account of who put it there.
      fragments: { [PLACED_FRAGMENT]: placedFragment, [RAISED_FRAGMENT]: raisedFragment },
    },
  });
