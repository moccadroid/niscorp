import { z } from 'zod';
import type { Shell } from '@niscorp/nova';
import { reconcileCanvas, type Desired } from '@niscorp/nova';
import { mountInputKeys } from '@niscorp/nova/reflect';
import { definitionsNow, type AvailableAction } from './knowledge';

export const ASSISTANT = 'assistant';

const Placement = z.object({
  id: z.string().describe('an ACTIONS id'),
  input: z.record(z.string(), z.unknown()).optional().describe("the action's input, per its schema in ACTIONS"),
});

const Fill = z.object({
  id: z.string().describe('an ACTIONS id already on SCREEN'),
  input: z.record(z.string(), z.unknown()).describe('fields to write into it, per its input schema'),
});

const COLUMNS = 'The COMPLETE contents of each canvas you name, not a change to it — a card you leave out of a canvas you named is closed. A canvas you do not name is left alone.';
const FILL = 'Write into cards already on screen, including theirs. Only the fields you name change.';

export const answerSchemaFor = (places: readonly string[]) =>
  z.object({
    ...(places.length === 0
      ? {}
      : { columns: z.object(Object.fromEntries(places.map((canvas) => [canvas, z.array(Placement).optional()]))).describe(COLUMNS) }),
    fill: z.array(Fill).optional().describe(FILL),
  });

export const AnswerSchema = z.object({
  columns: z
    .object({
      sheet: z.array(Placement).optional(),
      main: z.array(Placement).optional(),
      work: z.array(Placement).optional(),
      detail: z.array(Placement).optional(),
      aside: z.array(Placement).optional(),
    })
    .optional()
    .describe(COLUMNS),
  fill: z.array(Fill).optional().describe(FILL),
});

export type Answer = z.infer<typeof AnswerSchema>;
export type Applied = { changed: boolean; notes: string[]; wrote: WrittenKeys; closed: Set<string> };

export type WrittenKeys = Map<string, Set<string>>;
export type Session = { stayId: string; propertyId: string };

// Only the action's declared input keys survive. The session's `propertyId`, and
// its `stayId` when it has one, replace whatever was sent: a caller never chooses them.
export const seedFor = (
  entry: AvailableAction,
  given: Record<string, unknown>,
  session: Session,
  ignored?: string[],
): Record<string, unknown> => {
  const declared = new Set(Object.keys((entry.input as { properties?: Record<string, unknown> }).properties ?? {}));
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(given)) if (declared.has(key)) kept[key] = value;
  if (ignored !== undefined) for (const key of Object.keys(given)) if (!declared.has(key)) ignored.push(key);
  if (declared.has('stayId') && session.stayId !== '') kept['stayId'] = session.stayId;
  if (declared.has('propertyId')) kept['propertyId'] = session.propertyId;
  if (declared.has('capability') && entry.capabilities.length > 0) {
    const asked = String(kept['capability'] ?? '');
    kept['capability'] = entry.capabilities.includes(asked) ? asked : (entry.capabilities[0] ?? '');
  }
  return kept;
};

const aimOf = (input: Record<string, unknown>): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(input)
        .filter(([key]) => key !== 'sheetTitle')
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );

export type Dismissal = { title: string; definitionId: string; aim: string; at: number };
const DISMISSAL_CAP = 8;

const REFUSAL_WINDOW_MS = 20_000;
const REFUSAL_TTL_MS = 5 * 60_000;

export type Ledger = {
  remember: (instanceId: string, card: Dismissal) => void;
  sweep: (shell: Shell) => void;
  dismissals: () => readonly Dismissal[];
  lines: () => string;
};

const liveIds = (shell: Shell): Set<string> => {
  const out = new Set<string>();
  for (const state of Object.values(shell.getState().canvases)) for (const item of state.stack) out.add(item.id);
  return out;
};

export const createLedger = (): Ledger => {
  const offered = new Map<string, Dismissal>();
  const dismissed: Dismissal[] = [];

  const live = (): Dismissal[] => {
    const cutoff = Date.now() - REFUSAL_TTL_MS;
    while (dismissed.length > 0 && (dismissed[0]?.at ?? 0) < cutoff) dismissed.shift();
    return dismissed;
  };

  return {
    remember: (instanceId, card) => offered.set(instanceId, card),

    sweep: (shell) => {
      const present = liveIds(shell);
      const now = Date.now();
      for (const [id, card] of [...offered]) {
        if (present.has(id)) continue;
        offered.delete(id);
        if (now - card.at > REFUSAL_WINDOW_MS) continue;
        dismissed.push({ ...card, at: now });
        while (dismissed.length > DISMISSAL_CAP) dismissed.shift();
      }
    },

    dismissals: () => live(),

    lines: () =>
      live().length === 0
        ? ''
        : `REFUSED — you offered these and they closed them straight away. They said no:\n${live()
            .map((entry) => `  "${entry.title}" (${entry.definitionId})${entry.aim === '{}' ? '' : ` aimed at ${entry.aim}`}`)
            .join('\n')}`,
  };
};

const topInstanceOf = (shell: Shell, actionId: string): string | undefined => {
  for (const state of Object.values(shell.getState().canvases)) {
    for (let index = state.stack.length - 1; index >= 0; index -= 1) {
      const item = state.stack[index];
      if (item !== undefined && item.definitionId === actionId) return item.id;
    }
  }
  return undefined;
};

export const apply = (
  shell: Shell,
  ledger: Ledger,
  actions: readonly AvailableAction[],
  session: Session,
  allowed: readonly string[],
  answer: Answer,
): Applied => {
  const byId = new Map(actions.map((entry) => [entry.id, entry]));
  const definitions = definitionsNow();
  const wrote: WrittenKeys = new Map();
  const closed = new Set<string>();
  const notes: string[] = [];
  let changed = false;

  const refused = new Set(ledger.dismissals().map((entry) => `${entry.definitionId}:${entry.aim}`));
  const columns = answer.columns ?? {};
  for (const canvas of Object.keys(columns)) if (!allowed.includes(canvas)) notes.push(`refused ${canvas}: not this person's to place`);

  // A canvas the answer does not name is skipped, not reconciled with an empty
  // list: that would close the cards on it, and `columns: {}` means leave the screen alone.
  for (const canvas of allowed) {
    if (columns[canvas as keyof typeof columns] === undefined) continue;
    const wanted: Desired[] = [];
    for (const placement of columns[canvas as keyof typeof columns] ?? []) {
      const entry = byId.get(placement.id);
      if (entry === undefined) {
        notes.push(`unknown id "${placement.id}"`);
        continue;
      }
      const ignored: string[] = [];
      const input = seedFor(entry, (placement.input ?? {}) as Record<string, unknown>, session, ignored);
      if (ignored.length > 0) notes.push(`ignored on ${entry.id}: ${ignored.join(', ')} — not input`);
      if (refused.has(`${entry.id}:${aimOf(input)}`)) {
        notes.push(`dropped ${entry.id}: they closed this already`);
        continue;
      }
      const declared = new Set(Object.keys((entry.input as { properties?: Record<string, unknown> }).properties ?? {}));
      if (declared.has('sheetTitle')) input['sheetTitle'] = entry.title;
      wanted.push({ actionId: entry.id, input, with: canvas === 'aside' ? ['landed'] : ['detail', 'landed'] });
    }

    // A canvas the answer names is set to exactly what it names, which also closes
    // a card the user opened by hand.
    const standing = (shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.id);
    const result = reconcileCanvas(shell, canvas, wanted, {
      origin: ASSISTANT,
      own: 'canvas',
      definitionOf: (id) => definitions[id],
    });
    const left = new Set((shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.id));
    for (const id of standing) if (!left.has(id)) closed.add(id);
    changed = changed || result.changed;
    for (const note of result.notes) notes.push(`${note} on ${canvas}`);

    for (const item of shell.getState().canvases[canvas]?.stack ?? []) {
      const entry = wanted.find((other) => other.actionId === item.definitionId);
      if (entry === undefined) continue;
      const keys = Object.keys(entry.input ?? {});
      if (keys.length > 0) wrote.set(item.id, new Set([...(wrote.get(item.id) ?? []), ...keys]));
      if (shell.originOf(item.id) !== ASSISTANT) continue;
      ledger.remember(item.id, {
        title: byId.get(entry.actionId)?.title ?? definitions[entry.actionId]?.title ?? entry.actionId,
        definitionId: entry.actionId,
        aim: aimOf(entry.input ?? {}),
        at: Date.now(),
      });
    }
  }

  for (const request of answer.fill ?? []) {
    const entry = byId.get(request.id);
    if (entry === undefined) {
      notes.push(`unknown id "${request.id}"`);
      continue;
    }
    const found = topInstanceOf(shell, entry.id);
    if (found === undefined) {
      notes.push(`cannot fill ${entry.id}: not on screen`);
      continue;
    }
    const definition = definitions[entry.id];
    const spare: string[] = [];
    const input = seedFor(entry, request.input as Record<string, unknown>, session, spare);
    if (spare.length > 0) notes.push(`ignored on ${entry.id}: ${spare.join(', ')} — not input`);
    for (const key of definition === undefined ? [] : Object.keys(input).filter((k) => mountInputKeys(definition).has(k))) {
      delete input[key];
      notes.push(`cannot fill ${entry.id}.${key}: it decides what that card loads`);
    }
    const runtime = shell.getRuntime(found);
    if (runtime === undefined || Object.keys(input).length === 0) continue;
    const before = runtime.getData();
    if (!Object.entries(input).some(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value))) continue;
    runtime.setData({ ...before, ...input });
    changed = true;
    wrote.set(found, new Set([...(wrote.get(found) ?? []), ...Object.keys(input)]));
    notes.push(`filled ${Object.keys(input).join(', ')} on ${entry.id}`);
  }

  return { changed, notes, wrote, closed };
};
