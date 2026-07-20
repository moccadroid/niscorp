import type { EndpointEvent, FunctionHandler, ActionDefinition } from '@action';
import type { Shell } from '@shell';
import { snapshotShell, describeInstance, auditCatalog } from '../reflect';

// ═══════════════════════════════════════════════════════════
// The devtools functions — nova reading itself through the reflect API. Closed
// over ONE session's shell, with NO module globals: each session builds its
// own via its own `functions(session)` call, so multi-session is correct by
// construction (the singleton that broke the old app-local devtools is gone).
//
// Every view feeds from telemetry: the shell tree is reflect (pull) announced
// by state-change telemetry (`devtools:state`); the timeline IS the shell's
// endpoint telemetry (`shell.onEndpoint`), recorded per session and served by
// `devtools.timeline`.
// ═══════════════════════════════════════════════════════════

// The canvas the dock mounts on — excluded from its own shell snapshot AND from
// the timeline (the dock's reflect calls are the observer, not the observed).
export const DEVTOOLS_CANVAS = 'devtools';

// How many endpoint calls the per-session timeline retains (a ring buffer —
// oldest drops off). Bounded so a long-lived session can't grow unbounded.
const TIMELINE_CAP = 200;

export type TimelineEntry = {
  seq: number;
  name: string;
  kind: 'fn' | 'http';
  ok: boolean;
  status: number;
  ms: number;
  canvasId: string;
  instanceId: string;
  // the caller's definition id, resolved at record time (the instance is
  // alive then; it may be unmounted by the time the timeline is read)
  action: string;
};

export type DevtoolsConfig = {
  // LAZY — a host's session shell may not be built when `functions()` is
  // called; the thunk is only invoked inside a handler, at request time.
  shell: () => Shell;
  // the definitions to audit (the app's catalog); omit to skip the audit
  definitions?: Record<string, ActionDefinition> | readonly ActionDefinition[];
};

export const createDevtoolsFunctions = (config: DevtoolsConfig): Record<string, FunctionHandler> => {
  const { shell, definitions = {} } = config;

  // Per-session timeline — the recorded endpoint telemetry. A closure, not a
  // module global: dies with the session.
  const timeline: TimelineEntry[] = [];
  let seq = 0;

  // This factory runs mid-build (the dock's mount fires before the shell is
  // assigned), so tap the telemetry on a microtask — by then the shell exists.
  // A shell state change announces `devtools:state`; an endpoint call is
  // recorded and announces `devtools:timeline`. The dock listens and re-reads
  // (notify-then-pull). The initial publish paints the tree once it's up.
  // A data-only app (no shell) has no devtools — the thunk throws, caught.
  queueMicrotask(() => {
    try {
      const live = shell();
      live.onStateChange(() => live.publish('devtools:state'));
      live.onEndpoint((event: EndpointEvent) => {
        // The dock's own reflect calls (shellState/audit/describe/timeline) run
        // on the devtools canvas — exclude them, else the timeline records its
        // own reading and never settles.
        if (event.canvasId === DEVTOOLS_CANVAS) return;
        timeline.push({
          seq: (seq += 1),
          name: event.name,
          kind: event.kind,
          ok: event.ok,
          status: event.status,
          ms: Math.round(event.ms),
          canvasId: event.canvasId,
          instanceId: event.instanceId,
          action: live.getRuntime(event.instanceId)?.instance.definitionId ?? '',
        });
        if (timeline.length > TIMELINE_CAP) timeline.shift();
        live.publish('devtools:timeline');
      });
      live.publish('devtools:state');
    } catch {
      /* no shell to reflect */
    }
  });

  return {
    // The served "devtools on" control — mount/unmount the dock on its canvas.
    // A settings toggle binds `$.devtools` and calls setEnabled; this is the
    // old install `sync()`: on → push the dock if absent, off → clear the
    // canvas. `enabled` reads current state so the toggle reflects reality.
    'devtools.enabled': async () => {
      try {
        return shell().getCanvasState(DEVTOOLS_CANVAS).stack.length > 0;
      } catch {
        return false;
      }
    },
    'devtools.setEnabled': async (data) => {
      const on = data['devtools'] === true;
      try {
        const live = shell();
        const occupied = live.getCanvasState(DEVTOOLS_CANVAS).stack.length > 0;
        if (on && !occupied) live.push(DEVTOOLS_CANVAS, 'devtools.dock');
        else if (!on && occupied) live.clear(DEVTOOLS_CANVAS);
      } catch {
        /* the principal doesn't hold the dock, or no shell — a no-op */
      }
      return on;
    },
    'devtools.shellState': async () => snapshotShell(shell(), [DEVTOOLS_CANVAS]),
    'devtools.audit': async () => {
      const rows = auditCatalog(definitions);
      return { rows, address: rows.reduce((total, row) => total + row.address, 0), definitions: rows.length };
    },
    // Stack navigation from the dock — pop the top of a canvas's stack. Only
    // ever pops ABOVE the root (a canvas is never emptied from devtools).
    'devtools.pop': async (data) => {
      const canvasId = String(data['popCanvas'] ?? '');
      try {
        const live = shell();
        if (live.getCanvasState(canvasId).stack.length > 1) live.pop(canvasId);
      } catch {
        /* unknown canvas or no shell — a no-op */
      }
      return null;
    },
    // Newest first — the ring buffer is oldest→newest; the dock shows a feed.
    'devtools.timeline': async () => ({ rows: timeline.slice().reverse(), count: timeline.length }),
    'devtools.describe': async (data) =>
      describeInstance(shell(), String(data['instanceId'] ?? '')) ?? { id: 'unmounted', found: false, data: {}, layout: null, issues: [] },
  };
};
