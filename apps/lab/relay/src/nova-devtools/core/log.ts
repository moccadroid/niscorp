import type { Shell, StateSnapshot } from '@niscorp/nova';
import { isDevtoolsEnabled } from './flag';

// The devtools trace buffer + shell taps — headless, framework-free.
//
// Message triggers deliver NO payload (nova drops it by design), so entries
// don't travel over the bus. Instead this module keeps the ring buffer and the
// taps publish bare NOTIFICATIONS (`devtools:entry`, `devtools:state`,
// `devtools:watched`); the dock/inspector actions respond with a `call` to an
// fn endpoint (`devtools.pull`, …) that reads this buffer and lands the result
// in action data via `target`. Notification → call → target: nova's own flow.

export type FetchLogEntry = {
  kind: 'fetch';
  id: number;
  t: number;
  url: string;
  method: string;
  requestBody?: unknown;
  status?: number;
  ok?: boolean;
  ms?: number;
  responseBody?: unknown;
  error?: string;
};

export type DataLogEntry = {
  kind: 'data';
  id: number;
  t: number;
  instanceId: string;
  canvasId: string;
  definitionId?: string;
  // Top-level data keys that differ from the instance's previous snapshot.
  changed: string[];
  // Bursts (same instance, same keys, in quick succession) coalesce.
  count: number;
  data: Record<string, unknown>;
};

export type StateLogEntry = {
  kind: 'state';
  id: number;
  t: number;
  summary: string;
};

export type DevtoolsLogEntry = FetchLogEntry | DataLogEntry | StateLogEntry;

const CAP = 400;

let entries: readonly DevtoolsLogEntry[] = [];
let nextId = 1;

export const devtoolsLog = {
  entries: (): readonly DevtoolsLogEntry[] => entries,

  push: (entry: Omit<FetchLogEntry, 'id'> | Omit<DataLogEntry, 'id'> | Omit<StateLogEntry, 'id'>): number => {
    const id = nextId++;
    entries = [...entries.slice(-CAP + 1), { ...entry, id } as DevtoolsLogEntry];
    return id;
  },

  // Patch an existing entry (a fetch completing, a data burst coalescing) —
  // the ring may have evicted it, in which case this is a no-op.
  patch: (id: number, patch: Partial<FetchLogEntry> | Partial<DataLogEntry>): void => {
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) return;
    entries = [...entries.slice(0, index), { ...entries[index], ...patch } as DevtoolsLogEntry, ...entries.slice(index + 1)];
  },

  clear: (): void => {
    entries = [];
  },
};

// One-line description of a shell state transition, by diffing stacks against
// the previous snapshot ("main: 2 → 3 (deal)").
const summarize = (prev: StateSnapshot | undefined, next: StateSnapshot): string => {
  const parts: string[] = [];
  for (const [canvasId, canvas] of Object.entries(next.canvases)) {
    const before = prev?.canvases[canvasId];
    if (before === undefined) {
      if (prev !== undefined) parts.push(`+${canvasId}`);
      continue;
    }
    if (before.stack.length !== canvas.stack.length || before.active?.id !== canvas.active?.id) {
      const label = canvas.active?.definitionId ?? '·';
      parts.push(`${canvasId}: ${before.stack.length} → ${canvas.stack.length} (${label})`);
    }
  }
  for (const canvasId of Object.keys(prev?.canvases ?? {})) {
    if (!(canvasId in next.canvases)) parts.push(`−${canvasId}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'state change';
};

const COALESCE_MS = 2000;

// The devtools' own chatter must not re-enter the log: recording the dock's
// data changes would emit `devtools:entry`, which mutates the dock again — an
// infinite feedback loop. Everything on the devtools canvas is excluded.
export const DEVTOOLS_CANVAS = 'devtools';
const DEVTOOLS_DEFINITIONS = new Set(['devtools.dock', 'devtools.inspect']);

export const attachShellLogging = (shell: Shell): (() => void) => {
  let prev: StateSnapshot | undefined = shell.getState();
  const prevData = new Map<string, Record<string, unknown>>();
  let lastBurst: { entryId: number; signature: string; t: number; count: number } | undefined;

  const offState = shell.onStateChange((snapshot) => {
    const filtered: StateSnapshot = { canvases: { ...snapshot.canvases } };
    delete filtered.canvases[DEVTOOLS_CANVAS];
    const prevFiltered: StateSnapshot | undefined =
      prev === undefined ? undefined : { canvases: { ...prev.canvases } };
    if (prevFiltered !== undefined) delete prevFiltered.canvases[DEVTOOLS_CANVAS];
    const changed = summarize(prevFiltered, filtered);
    prev = snapshot;
    const live = new Set(Object.values(snapshot.canvases).flatMap((c) => c.stack.map((i) => i.id)));
    for (const id of prevData.keys()) if (!live.has(id)) prevData.delete(id);
    if (!isDevtoolsEnabled() || changed === 'state change') return;
    devtoolsLog.push({ kind: 'state', t: Date.now(), summary: changed });
    shell.publish('devtools:state');
  });

  const offData = shell.onDataChange((event) => {
    if (event.canvasId === DEVTOOLS_CANVAS) return;
    const before = prevData.get(event.instanceId);
    prevData.set(event.instanceId, event.data);
    if (!isDevtoolsEnabled()) return;
    const definitionId = shell.getRuntime(event.instanceId)?.instance.definitionId ?? '';
    if (DEVTOOLS_DEFINITIONS.has(definitionId)) return;

    // Feed a live inspector: when the devtools canvas is showing an inspector
    // watching THIS instance, nudge it to re-describe.
    const watching = shell.getCanvasState(DEVTOOLS_CANVAS).active;
    if (watching?.definitionId === 'devtools.inspect' && watching.data['instanceId'] === event.instanceId) {
      shell.publish('devtools:watched');
    }

    // Top-level shallow diff — the store replaces changed values, so !== is exact.
    const changed =
      before === undefined
        ? Object.keys(event.data)
        : Object.keys({ ...before, ...event.data }).filter((key) => before[key] !== event.data[key]);
    if (changed.length === 0) return;

    const now = Date.now();
    const signature = `${event.instanceId}:${changed.join(',')}`;
    if (lastBurst !== undefined && lastBurst.signature === signature && now - lastBurst.t < COALESCE_MS) {
      lastBurst.t = now;
      lastBurst.count += 1;
      devtoolsLog.patch(lastBurst.entryId, { count: lastBurst.count, data: event.data });
      shell.publish('devtools:entry');
      return;
    }
    const entryId = devtoolsLog.push({
      kind: 'data',
      t: now,
      instanceId: event.instanceId,
      canvasId: event.canvasId,
      definitionId,
      changed,
      count: 1,
      data: event.data,
    });
    lastBurst = { entryId, signature, t: now, count: 1 };
    shell.publish('devtools:entry');
  });

  return () => {
    offState();
    offData();
  };
};

// Called by traceFetch (which has no shell reference) — the fn-endpoint pull
// cycle is driven by the notification, so fetch tracing routes through here.
let notifyShell: Shell | undefined;
export const bindLogNotifier = (shell: Shell): void => {
  notifyShell = shell;
};
export const notifyEntry = (): void => {
  notifyShell?.publish('devtools:entry');
};
