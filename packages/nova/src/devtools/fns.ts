import type { EndpointEvent, FunctionHandler, ActionDefinition } from '@action';
import type { Shell } from '@shell';
import { snapshotShell, describeInstance, auditCatalog } from '../reflect';

export const DEVTOOLS_CANVAS = 'devtools';

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
  action: string;
};

export type DevtoolsConfig = {
  shell: () => Shell;
  definitions?: Record<string, ActionDefinition> | readonly ActionDefinition[];
};

export const createDevtoolsFunctions = (config: DevtoolsConfig): Record<string, FunctionHandler> => {
  const { shell, definitions = {} } = config;

  const timeline: TimelineEntry[] = [];
  let seq = 0;

  // This factory runs before the host has assigned its shell, so the telemetry
  // is tapped on a microtask: by then the shell exists.
  queueMicrotask(() => {
    try {
      const live = shell();
      live.onStateChange(() => live.publish('devtools:state'));
      live.onEndpoint((event: EndpointEvent) => {
        // The dock's own calls: recorded, each would announce the timeline, the
        // dock would read it again, and it would never settle.
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
      /* an app without a shell: the thunk throws */
    }
  });

  return {
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
        /* the principal does not hold the dock, or there is no shell */
      }
      return on;
    },
    'devtools.shellState': async () => snapshotShell(shell(), [DEVTOOLS_CANVAS]),
    'devtools.audit': async () => {
      const rows = auditCatalog(definitions);
      return { rows, address: rows.reduce((total, row) => total + row.address, 0), definitions: rows.length };
    },
    'devtools.pop': async (data) => {
      const canvasId = String(data['popCanvas'] ?? '');
      try {
        const live = shell();
        if (live.getCanvasState(canvasId).stack.length > 1) live.pop(canvasId);
      } catch {}
      return null;
    },
    'devtools.timeline': async () => ({ rows: timeline.slice().reverse(), count: timeline.length }),
    'devtools.describe': async (data) =>
      describeInstance(shell(), String(data['instanceId'] ?? '')) ?? { id: 'unmounted', found: false, data: {}, layout: null, issues: [] },
  };
};
