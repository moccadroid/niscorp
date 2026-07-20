import type { Shell } from '@shell';
import type { ActionDefinition, EndpointConfig, TriggerConfig } from '@action';
import type { LayoutNode } from '@layout';
import { classifyAudit, type ClassifiedIssue } from './audit';
import { auditAction } from '@action';

// ═══════════════════════════════════════════════════════════
// Shell reflection — nova reading its own running state. The canvas/instance
// tree (snapshotShell) and a full model for one instance (describeInstance).
// Both were re-derived in relay's devtools fns; they're pure reads over the
// Shell's own introspection API, so they belong here. Consumers: devtools, and
// (server-ladder) the working-set / level-streaming that walks the same tree.
// ═══════════════════════════════════════════════════════════

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
  // every component name the shell's registry can render
  components: string[];
};

// The whole shell as a tree of canvases → instances, plus the shell-level
// model (layout store ids, registered component names). `exclude` drops
// canvases the caller owns (a devtools canvas shouldn't inspect itself).
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

// The full model for one live instance — its definition wiring, its current
// data, and its classified audit. `undefined` when the id isn't mounted.
export const describeInstance = (shell: Shell, instanceId: string): InstanceModel | undefined => {
  const runtime = shell.getRuntime(instanceId);
  if (runtime === undefined) return undefined;

  const definition: ActionDefinition = runtime.definition;
  const layout = definition.layout;
  const layoutNode = typeof layout === 'string' ? shell.layoutStore.get(layout) : layout;
  const issues = auditAction(definition).issues.map((issue): ClassifiedIssue => ({ issue, ...classifyAudit(issue, definition) }));

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
