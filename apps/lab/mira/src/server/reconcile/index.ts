import type { Reconciler } from '@niscorp/nova';

const keyOfRow = (row: Record<string, unknown> | undefined): string | undefined => {
  const key = row?.['key'];
  return typeof key === 'string' && key !== '' ? key : undefined;
};

const differs = (data: Record<string, unknown>, input: Record<string, unknown>): boolean => Object.entries(input).some(([field, value]) => JSON.stringify(data[field]) !== JSON.stringify(value));

// The screen's cards, matched by the key each row carries: a card whose key is on the canvas is that instance, moved to
// its place, with what it is given written into it; a key not there is opened there; an instance whose key no row has,
// or that is another action now, is closed. A row without a key, or with one an earlier row has, is not placed.
const keyed: Reconciler = (shell, canvasId, desired, { origin, own, moveInstance, keyOf }) => {
  const notes: string[] = [];
  if (shell.getState().canvases[canvasId] === undefined) return { changed: false, notes: [`no canvas "${canvasId}"`] };
  const stack = () => shell.getState().canvases[canvasId]?.stack ?? [];
  const placeOf = (id: string): number => stack().findIndex((instance) => instance.id === id);
  let changed = false;

  const wanted: { key: string; entry: (typeof desired)[number] }[] = [];
  for (const entry of desired) {
    const key = keyOfRow(entry.row);
    if (key !== undefined && !wanted.some((other) => other.key === key)) wanted.push({ key, entry });
  }

  for (const instance of stack()) {
    const key = keyOf(instance.id);
    const stays = wanted.some((row) => row.key === key && row.entry.actionId === instance.definitionId);
    if (stays || (own !== 'canvas' && shell.originOf(instance.id) !== origin)) continue;
    shell.removeInstance(canvasId, instance.id);
    changed = true;
    notes.push(`closed ${instance.definitionId}`);
  }

  wanted.forEach(({ key, entry }, index) => {
    const input = entry.input ?? {};
    const there = stack().find((instance) => keyOf(instance.id) === key);
    const id = there?.id ?? shell.push(canvasId, entry.actionId, input, entry.with, { origin, key });
    if (there === undefined) {
      changed = true;
      notes.push(`placed ${entry.actionId}`);
    } else {
      const runtime = shell.getRuntime(there.id);
      const data = runtime?.getData() ?? {};
      if (runtime !== undefined && differs(data, input)) {
        runtime.setData({ ...data, ...input });
        changed = true;
        notes.push(`set ${Object.keys(input).join(', ')} on ${entry.actionId}`);
      }
    }
    if (placeOf(id) === index) return;
    moveInstance(canvasId, id, index);
    changed = true;
    if (there !== undefined) notes.push(`moved ${entry.actionId} to ${String(index + 1)}`);
  });

  return { changed, notes };
};

export const reconcilers = { keyed };
