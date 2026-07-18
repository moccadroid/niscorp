import { auditAction, collectChannels } from '@niscorp/nova';
import type { ActionDefinition, FunctionHandler } from '@niscorp/nova';
import { ACTIONS } from '@relay/app/action-catalog';
import { getDevtoolsShell } from './bridge';
import { classifyIssue } from './audit-classify';
import type { IssueClass } from './audit-classify';
import { devtoolsLog, DEVTOOLS_CANVAS } from './log';
import type { DevtoolsLogEntry } from './log';
import { summarizeEndpoint, summarizeTrigger } from './summarize';

// The devtools functions — registered into the shell like Ray's. All the
// derivation logic (formatting, filtering, auditing, describing) lives here as
// `fn:` endpoints; the dock/inspector ACTIONS are pure data that `call` these
// and render whatever lands at `target`. This is the portable split: these
// fns are framework-free, the layouts are nova, only primitives are React.

const time = (t: number): string => {
  const d = new Date(t);
  return `${d.toLocaleTimeString(undefined, { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

// ── timeline ────────────────────────────────────────────────

type TimelineRow = {
  id: number;
  time: string;
  badge: string;
  tone: 'slate' | 'blue' | 'green' | 'red' | 'purple';
  label: string;
  detail: unknown;
};

const toRow = (entry: DevtoolsLogEntry): TimelineRow => {
  if (entry.kind === 'state') {
    return { id: entry.id, time: time(entry.t), badge: 'nav', tone: 'purple', label: entry.summary, detail: null };
  }
  if (entry.kind === 'data') {
    const count = entry.count > 1 ? ` ×${entry.count}` : '';
    return {
      id: entry.id,
      time: time(entry.t),
      badge: 'data',
      tone: 'blue',
      label: `${entry.canvasId} › ${entry.definitionId ?? entry.instanceId} · ${entry.changed.join(', ')}${count}`,
      detail: entry.data,
    };
  }
  const outcome = entry.error !== undefined ? 'ERR' : entry.status !== undefined ? String(entry.status) : '…';
  const failed = entry.error !== undefined || entry.ok === false;
  return {
    id: entry.id,
    time: time(entry.t),
    badge: outcome,
    tone: failed ? 'red' : 'green',
    label: `${entry.method} ${entry.url}${entry.ms !== undefined ? ` · ${entry.ms}ms` : ''}`,
    detail: {
      ...(entry.requestBody !== undefined ? { request: entry.requestBody } : {}),
      ...(entry.responseBody !== undefined ? { response: entry.responseBody } : {}),
      ...(entry.error !== undefined ? { error: entry.error } : {}),
    },
  };
};

const KIND_FLAG: Record<DevtoolsLogEntry['kind'], string> = { state: 'showNav', data: 'showData', fetch: 'showNet' };

// data: { paused, showNav, showData, showNet, view: { rows, maxId } }
const pull: FunctionHandler = async (data) => {
  const all = devtoolsLog.entries();
  const view = data['view'] as { rows?: TimelineRow[]; maxId?: number } | undefined;
  if (data['paused'] === true) {
    // Hold the pinned rows; only the behind-counter moves.
    const maxId = view?.maxId ?? 0;
    return { rows: view?.rows ?? [], maxId, total: all.length, behind: all.filter((e) => e.id > maxId).length };
  }
  const rows = all
    .filter((e) => data[KIND_FLAG[e.kind]] !== false)
    .map(toRow)
    .reverse();
  return { rows, maxId: all[all.length - 1]?.id ?? 0, total: all.length, behind: 0 };
};

const clear: FunctionHandler = async () => {
  devtoolsLog.clear();
  return { rows: [], maxId: 0, total: 0, behind: 0 };
};

// ── shell snapshot ──────────────────────────────────────────

const shellState: FunctionHandler = async () => {
  const shell = getDevtoolsShell();
  const snapshot = shell.getState();
  const canvases = Object.values(snapshot.canvases)
    .filter((canvas) => canvas.id !== DEVTOOLS_CANVAS)
    .map((canvas) => ({
      id: canvas.id,
      depth: canvas.stack.length,
      items: [...canvas.stack].reverse().map((instance) => ({
        definitionId: instance.definitionId,
        instanceId: instance.id,
        status: instance.status,
        active: instance.id === canvas.active?.id,
      })),
    }));
  return { canvases, layouts: shell.layoutStore.list().join(', ') };
};

// ── audit ───────────────────────────────────────────────────

type ClassifiedIssue = { issue: string; info: boolean; tag: string; reason: string };

const classifyAll = (): { id: string; address: number; issues: ClassifiedIssue[] }[] => {
  const definitions = Object.values(ACTIONS);
  const catalog = definitions.map((d) => ({ id: d.id, ...(d.input !== undefined ? { input: d.input } : {}) }));
  const channels = [...new Set(definitions.flatMap((d) => {
    const usage = collectChannels(d);
    return [...usage.emits, ...usage.listens];
  }))];
  return definitions
    .map((d) => {
      const issues = auditAction(d, { catalog, channels }).issues.map((issue): ClassifiedIssue => {
        const cls: IssueClass = classifyIssue(issue, d);
        return cls.kind === 'address'
          ? { issue, info: false, tag: '', reason: '' }
          : { issue, info: true, tag: cls.tag, reason: cls.reason };
      });
      issues.sort((a, b) => Number(a.info) - Number(b.info));
      return { id: d.id, address: issues.filter((i) => !i.info).length, issues };
    })
    .filter((r) => r.issues.length > 0)
    .sort((a, b) => b.address - a.address);
};

const audit: FunctionHandler = async () => {
  const rows = classifyAll();
  const address = rows.reduce((n, r) => n + r.address, 0);
  const total = rows.reduce((n, r) => n + r.issues.length, 0);
  return { rows, address, explained: total - address, definitions: Object.keys(ACTIONS).length };
};

const auditReport = (): string => {
  const rows = classifyAll();
  const address = rows.reduce((n, r) => n + r.address, 0);
  const total = rows.reduce((n, r) => n + r.issues.length, 0);
  const lines = [
    `# nova-devtools audit — ${Object.keys(ACTIONS).length} definitions: ${address} to address, ${total - address} explained`,
    `(static auditAction on raw definitions; [info:*] findings are computed as in-scope at runtime — kept for the record)`,
  ];
  for (const { id, issues } of rows) {
    lines.push('', `## ${id} (${issues.length})`);
    for (const { issue, info, tag, reason } of issues) {
      lines.push(info ? `- [info:${tag}] ${issue} — ${reason}` : `- [ADDRESS] ${issue}`);
    }
  }
  return lines.join('\n');
};

const copyReport: FunctionHandler = async () => {
  const report = auditReport();
  if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
    await navigator.clipboard.writeText(report);
    return true;
  }
  return false;
};

const logReport: FunctionHandler = async () => {
  // eslint-disable-next-line no-console
  console.log(`[nova-devtools] audit report\n\n${auditReport()}\n`);
  return true;
};

// ── inspector ───────────────────────────────────────────────

// data: { instanceId } → the full display model for one action instance.
const describe: FunctionHandler = async (data) => {
  const shell = getDevtoolsShell();
  const instanceId = String(data['instanceId'] ?? '');
  const runtime = shell.getRuntime(instanceId);
  if (runtime === undefined) return { found: false, id: instanceId };

  const definition: ActionDefinition = runtime.definition;
  const layout = definition.layout;
  const layoutNode = typeof layout === 'string' ? shell.layoutStore.get(layout) : layout;
  const issues = auditAction(definition).issues.map((issue): ClassifiedIssue => {
    const cls = classifyIssue(issue, definition);
    return cls.kind === 'address'
      ? { issue, info: false, tag: '', reason: '' }
      : { issue, info: true, tag: cls.tag, reason: cls.reason };
  });
  return {
    found: true,
    id: definition.id,
    instanceId,
    canvasId: runtime.instance.canvasId,
    status: runtime.instance.status,
    title: definition.title ?? '',
    data: runtime.getData(),
    endpoints: Object.entries(definition.endpoints ?? {}).map(([name, config]) => ({
      name,
      summary: summarizeEndpoint(config),
      config,
    })),
    triggers: (definition.triggers ?? []).map(summarizeTrigger),
    lifecycle: Object.entries(definition.lifecycle ?? {}).map(([hook, steps]) => ({
      hook,
      count: Array.isArray(steps) ? steps.length : 0,
      steps,
    })),
    layoutKind: typeof layout === 'string' ? `store id: ${layout}` : 'inline',
    layout: layoutNode ?? null,
    input: definition.input ?? null,
    issues,
    issueCount: issues.length,
    addressCount: issues.filter((i) => !i.info).length,
  };
};

// "log to console" for one instance — definition + live data + canvas state.
const logInstance: FunctionHandler = async (data) => {
  const shell = getDevtoolsShell();
  const instanceId = String(data['instanceId'] ?? '');
  const runtime = shell.getRuntime(instanceId);
  if (runtime === undefined) return false;
  const layout = runtime.definition.layout;
  // eslint-disable-next-line no-console
  console.log(`[nova-devtools] ${runtime.definition.id} (${instanceId})`, {
    definition: runtime.definition,
    layout: typeof layout === 'string' ? shell.layoutStore.get(layout) : layout,
    data: runtime.getData(),
    canvas: shell.getCanvasState(runtime.instance.canvasId),
  });
  return true;
};

export const devtoolsFunctions: Record<string, FunctionHandler> = {
  'devtools.pull': pull,
  'devtools.clear': clear,
  'devtools.shellState': shellState,
  'devtools.audit': audit,
  'devtools.copyReport': copyReport,
  'devtools.logReport': logReport,
  'devtools.describe': describe,
  'devtools.logInstance': logInstance,
};
