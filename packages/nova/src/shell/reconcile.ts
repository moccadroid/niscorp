import type { ActionDefinition } from '../action';
import { mountInputKeys } from '../reflect/grammar';
import type { Shell } from './types';

export type Desired = {
  actionId: string;
  input?: Record<string, unknown>;
  with?: string[];
};

export type ReconcileOptions = {
  origin: string;
  // With it, an input key the action's mount-time load reads re-mounts the
  // instance: written in place, it would leave the previous record's data on screen.
  definitionOf?: (actionId: string) => ActionDefinition | undefined;
  own?: 'pushed' | 'canvas';
};

export type ReconcileResult = {
  changed: boolean;
  notes: string[];
};

const differs = (before: Record<string, unknown>, input: Record<string, unknown>): boolean =>
  Object.entries(input).some(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value));

export const reconcileCanvas = (shell: Shell, canvasId: string, desired: readonly Desired[], options: ReconcileOptions): ReconcileResult => {
  const { origin, definitionOf } = options;
  const ownsCanvas = options.own === 'canvas';
  const notes: string[] = [];
  let changed = false;

  if (shell.getState().canvases[canvasId] === undefined) return { changed: false, notes: [`no canvas "${canvasId}"`] };

  const wanted: Desired[] = [];
  for (const entry of desired) if (!wanted.some((other) => other.actionId === entry.actionId)) wanted.push(entry);

  const mine = (shell.getState().canvases[canvasId]?.stack ?? []).filter((item) => ownsCanvas || shell.originOf(item.id) === origin);
  for (const item of mine) {
    if (wanted.some((entry) => entry.actionId === item.definitionId)) continue;
    shell.removeInstance(canvasId, item.id);
    changed = true;
    notes.push(`closed ${item.definitionId}`);
  }

  for (const entry of wanted) {
    const input = entry.input ?? {};
    const existing = (shell.getState().canvases[canvasId]?.stack ?? []).find((item) => item.definitionId === entry.actionId);

    if (existing !== undefined && !ownsCanvas && shell.originOf(existing.id) !== origin) {
      notes.push(`left ${entry.actionId}: not mine`);
      continue;
    }

    if (existing !== undefined) {
      const runtime = shell.getRuntime(existing.id);
      const before = runtime?.getData() ?? {};
      if (runtime === undefined || Object.keys(input).length === 0 || !differs(before, input)) continue;

      const definition = definitionOf?.(entry.actionId);
      const reAims = definition !== undefined && Object.keys(input).some((key) => mountInputKeys(definition).has(key));
      if (!reAims) {
        runtime.setData({ ...before, ...input });
        changed = true;
        notes.push(`set ${Object.keys(input).join(', ')} on ${entry.actionId}`);
        continue;
      }
      shell.removeInstance(canvasId, existing.id);
      notes.push(`re-opened ${entry.actionId}`);
    }

    shell.push(canvasId, entry.actionId, input, entry.with, { origin });
    changed = true;
    notes.push(`placed ${entry.actionId}`);
  }

  return { changed, notes };
};
