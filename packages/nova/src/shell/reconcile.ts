import type { ActionDefinition } from '../action';
import { mountInputKeys } from '../reflect/grammar';
import type { Shell } from './types';

export type Desired = {
  actionId: string;
  input?: Record<string, unknown>;
  with?: string[];
  row?: Record<string, unknown>;
};

export type ReconcileOptions = {
  origin: string;
  // With it, an input key the action's mount-time load reads re-mounts the
  // instance: written in place, it would leave the previous record's data on screen.
  definitionOf?: (actionId: string) => ActionDefinition | undefined;
  own?: 'pushed' | 'canvas';
  // With it, a row is compared with the input this map says its instance was last given, not with the instance's data.
  lastInputs?: Map<string, Record<string, unknown>>;
};

export type ReconcileResult = {
  changed: boolean;
  notes: string[];
};

export type ReconcilerOptions = ReconcileOptions & {
  moveInstance: (canvasId: string, instanceId: string, index: number) => void;
  keyOf: (instanceId: string) => string | undefined;
};

export type Reconciler = (shell: Shell, canvasId: string, desired: readonly Desired[], options: ReconcilerOptions) => ReconcileResult;

const changedKeys = (before: Record<string, unknown>, input: Record<string, unknown>): string[] =>
  Object.keys(input).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(input[key]));

export const reconcileCanvas = (shell: Shell, canvasId: string, desired: readonly Desired[], options: ReconcileOptions): ReconcileResult => {
  const { origin, definitionOf, lastInputs } = options;
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
      const inputChanges = changedKeys(lastInputs?.get(existing.id) ?? before, input);
      if (runtime === undefined || inputChanges.length === 0) continue;

      const definition = definitionOf?.(entry.actionId);
      const reAims = definition !== undefined && Object.keys(input).some((key) => mountInputKeys(definition).has(key));
      if (!reAims) {
        const written = lastInputs === undefined ? Object.keys(input) : inputChanges;
        runtime.setData({ ...before, ...Object.fromEntries(written.map((key) => [key, input[key]])) });
        lastInputs?.set(existing.id, { ...lastInputs.get(existing.id), ...input });
        changed = true;
        notes.push(`set ${written.join(', ')} on ${entry.actionId}`);
        continue;
      }
      shell.removeInstance(canvasId, existing.id);
      notes.push(`re-opened ${entry.actionId}`);
    }

    const placed = shell.push(canvasId, entry.actionId, input, entry.with, { origin });
    lastInputs?.set(placed, input);
    changed = true;
    notes.push(`placed ${entry.actionId}`);
  }

  return { changed, notes };
};
