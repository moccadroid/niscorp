import { defineApp } from '@niscorp/moss';
import type { NiscApp } from '@niscorp/moss';
import type { Seam } from '@atrium/admin/seam';
import { ADMIN_CHARTER, ADMIN_ASSIGNMENTS } from './charter';
import { ADMIN_ACTIONS } from './actions';
import { previewFragment } from './actions/preview.fragment';
import { adminFunctions } from './functions';
import { adminFrame } from './frame.layout';

// The administration tool as a moss app — which is the whole joke and also the
// whole point: our own product is built the way the products we sell are, out
// of a charter, a catalog and a frame, so anything we learn making this one
// better is something every app in the estate gets.
//
// It is a FUNCTION of the seam for the same reason atrium's manifest is a
// function of its bundles: what this app can do depends entirely on what it is
// pointed at, and pretending otherwise would bake one deployment into the tool.
// Point it at a different app server and it is the same tool.
//
// Note what is absent. No `entries`, no `resources`, no `behaviors`, no
// `scope` — this app mounts no vex and owns no data. There is therefore no
// path from any pane to any hotel's rows, and that is a fact about the
// manifest rather than a promise in a comment.
export const buildAdmin = (seam: Seam): NiscApp =>
  defineApp({
    charter: ADMIN_CHARTER,
    assignments: ADMIN_ASSIGNMENTS,
    actions: ADMIN_ACTIONS,

    // Every handler is a seam call. The session comes in for exactly one of
    // them — the layout preview registers a foreign definition onto this
    // shell — and no handler reads a principal, because this app has one
    // audience and no tenancy: we are not a tenant of anything.
    functions: (session) => adminFunctions(session, seam),

    shell: {
      // One canvas, a stack. The pill sits at the bottom of it forever and
      // panes push over it; popping is the way back. An anonymous principal
      // holds no `admin.dock`, so this canvas mounts nothing at all and the
      // frame serves an empty tree — which is what a stranger sees.
      canvases: [{ id: 'admin', initial: 'admin.dock' }],
      layout: adminFrame,
      // The chrome a previewed layout wears. It has to be a fragment because
      // the layout inside it is not ours.
      fragments: { preview: previewFragment },
    },
  });
