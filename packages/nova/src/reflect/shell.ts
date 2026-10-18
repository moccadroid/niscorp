import type { Shell } from '@shell';
import type { ActionDefinition, EndpointConfig, TriggerConfig } from '@action';
import type { LayoutNode } from '@layout';
import { classifyAudit, type ClassifiedIssue } from './audit';
import { auditAction } from '@action';

export type InstanceRef = {
  definitionId: string;
  instanceId: string;
  status: string;
  active: boolean;
};

export type CanvasRef = {
  id: string;
  depth: number;
  // top-of-stack first
  items: InstanceRef[];
};

export type ShellSnapshot = {
  canvases: CanvasRef[];
  layouts: string[];
  components: string[];
};

export const snapshotShell = (shell: Shell, exclude: readonly string[] = []): ShellSnapshot => {
  const state = shell.getState();
  const canvases = Object.values(state.canvases)
    .filter((canvas) => !exclude.includes(canvas.id))
    .map((canvas): CanvasRef => ({
      id: canvas.id,
      depth: canvas.stack.length,
      items: [...canvas.stack].reverse().map((instance): InstanceRef => ({
        definitionId: instance.definitionId,
        instanceId: instance.id,
        status: instance.status,
        active: instance.id === canvas.active?.id,
      })),
    }));
  return { canvases, layouts: shell.layoutStore.list(), components: shell.registry.list() };
};

export type DescribeShellOptions = {
  only?: readonly string[];
  mark?: (instanceId: string) => string | undefined;
  collapseOver?: number;
  head?: number;
  clean?: (data: Record<string, unknown>) => Record<string, unknown>;
};

const compact = (value: unknown, over: number, head: number): unknown => {
  if (Array.isArray(value)) {
    return over === 0 || value.length <= over ? value.map((item) => compact(item, over, head)) : [...value.slice(0, head).map((item) => compact(item, over, head)), `…${value.length - head} more`];
  }
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) out[key] = compact(inner, over, head);
  return out;
};

export const describeShell = (shell: Shell, options: DescribeShellOptions = {}): string => {
  const { only, mark, collapseOver = 5, head = 3, clean } = options;
  const lines: string[] = [];
  for (const [canvasId, canvas] of Object.entries(shell.getState().canvases)) {
    if (only !== undefined && !only.includes(canvasId)) continue;
    if (canvas.active === undefined) {
      lines.push(`  ${canvasId}: (empty)`);
      continue;
    }
    lines.push(`  ${canvasId}: ${canvas.stack.map((item, index) => `${item.definitionId}${index === canvas.stack.length - 1 ? '*' : ''}`).join(' › ')}`);
    for (const item of canvas.stack) {
      const runtime = shell.getRuntime(item.id);
      const note = mark?.(item.id);
      const data = runtime === undefined ? undefined : (clean ?? ((value: Record<string, unknown>) => value))(runtime.getData());
      lines.push(`    ${item.definitionId}${note === undefined ? '' : ` ${note}`} data: ${data === undefined ? '{}' : JSON.stringify(compact(data, collapseOver, head))}`);
    }
  }
  return lines.join('\n');
};

export type InstanceModel = {
  id: string;
  instanceId: string;
  canvasId: string;
  status: string;
  title: string;
  data: Record<string, unknown>;
  endpoints: Array<{ name: string; config: EndpointConfig }>;
  triggers: TriggerConfig[];
  lifecycle: Record<string, unknown>;
  layoutKind: 'inline' | 'store';
  layout: LayoutNode | undefined;
  input: Record<string, unknown> | undefined;
  issues: ClassifiedIssue[];
};

export const describeInstance = (shell: Shell, instanceId: string): InstanceModel | undefined => {
  const runtime = shell.getRuntime(instanceId);
  if (runtime === undefined) return undefined;

  const definition: ActionDefinition = runtime.definition;
  const layout = definition.layout;
  const layoutNode = typeof layout === 'string' ? shell.layoutStore.get(layout) : layout;
  const issues = auditAction(definition).issues.map((issue): ClassifiedIssue => ({ issue, ...classifyAudit(issue) }));

  return {
    id: definition.id,
    instanceId,
    canvasId: runtime.instance.canvasId,
    status: runtime.instance.status,
    title: definition.title ?? '',
    data: runtime.getData(),
    endpoints: Object.entries(definition.endpoints ?? {}).map(([name, config]) => ({ name, config })),
    triggers: definition.triggers ?? [],
    lifecycle: definition.lifecycle ?? {},
    layoutKind: typeof layout === 'string' ? 'store' : 'inline',
    layout: layoutNode,
    input: definition.input,
    issues,
  };
};
