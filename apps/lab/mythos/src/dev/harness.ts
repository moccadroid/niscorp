import process from 'node:process';
import type { RenderNode, Shell } from '@niscorp/nova';

// Shared bones of every headless check: [pass]/[fail] lines, a non-zero
// exit on any failure, polling for async action data, and tree helpers.

let failures = 0;

export const check = (name: string, passed: boolean, detail?: string): void => {
  const suffix = !passed && detail !== undefined ? ` — ${detail}` : '';
  console.log(`${passed ? '[pass]' : '[fail]'} ${name}${suffix}`);
  if (!passed) failures += 1;
};

export const finish = (label: string): never => {
  if (failures === 0) {
    console.log(`[pass] ${label}: all checks passed`);
    process.exit(0);
  }
  console.log(`[fail] ${label}: ${failures} check(s) failed`);
  process.exit(1);
};

export const fail = (label: string, error: unknown): never => {
  console.error(`[fail] ${label}: crashed`, error);
  process.exit(1);
};

export const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return predicate();
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const activeData = (shell: Shell, canvasId: string): Record<string, unknown> => {
  const active = shell.getCanvasState(canvasId).active;
  const runtime = active === undefined ? undefined : shell.getRuntime(active.id);
  return runtime?.getData() ?? {};
};

export const activeDefinition = (shell: Shell, canvasId: string): string =>
  shell.getCanvasState(canvasId).active?.definitionId ?? '';

// Model listeners are installed by render() (the React adapter renders on
// every change; headless checks must render explicitly before ui:model).
export const renderActive = (shell: Shell, canvasId: string): void => {
  const active = shell.getCanvasState(canvasId).active;
  if (active !== undefined) shell.getRuntime(active.id)?.render();
};

export const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

export const componentNames = (nodes: RenderNode[]): Set<string> => {
  const names = new Set<string>();
  const walk = (list: RenderNode[]): void => {
    for (const node of list) {
      if (node.type === 'component') {
        names.add(node.name);
        walk(node.children);
      }
      if (node.type === 'fragment') walk(node.children);
    }
  };
  walk(nodes);
  return names;
};
