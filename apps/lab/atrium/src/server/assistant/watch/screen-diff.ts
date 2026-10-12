import type { ActionDefinition, Shell } from '@niscorp/nova';
import { lifecycleKeys, loadedKeys } from '@niscorp/nova/reflect';

// `aside` is watched although only the assistant places there: the clerk pressing
// a card it staged is a gesture. `mine` keeps the assistant from watching itself.
export const WATCHED: readonly string[] = ['main', 'home', 'work', 'detail', 'nav', 'sheet', 'aside'];

const quietCache = new WeakMap<ActionDefinition, ReadonlySet<string>>();

// Written by the click that opens the record: counting it would report one gesture twice.
const SELECTION = new Set(['openRow']);

const quietKeys = (definition: ActionDefinition): ReadonlySet<string> => {
  const cached = quietCache.get(definition);
  if (cached !== undefined) return cached;
  const keys = new Set([...loadedKeys(definition), ...lifecycleKeys(definition), ...SELECTION]);
  quietCache.set(definition, keys);
  return keys;
};

export type Card = { canvas: string; definitionId: string; title: string; mine: boolean; values: Record<string, unknown> };
export type Fingerprint = Map<string, Card>;

export const fingerprintOf = (shell: Shell, definitions: Record<string, ActionDefinition>, mine: (instanceId: string) => boolean): Fingerprint => {
  const out: Fingerprint = new Map();
  const state = shell.getState();
  for (const canvas of WATCHED) {
    for (const item of state.canvases[canvas]?.stack ?? []) {
      const definition = definitions[item.definitionId];
      if (definition === undefined) continue;
      const quiet = quietKeys(definition);
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(shell.getRuntime(item.id)?.getData() ?? {})) if (!quiet.has(key)) values[key] = value;
      out.set(item.id, { canvas, definitionId: item.definitionId, title: definition.title ?? item.definitionId, mine: mine(item.id), values });
    }
  }
  return out;
};

const brief = (value: unknown, cap: number): string => {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  return text.length <= cap ? text : `${text.slice(0, cap)}…`;
};

const carries = (value: unknown): boolean => {
  if (value === '' || value === undefined || value === null || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

// What the last answer did, which the diff must not report as the person's doing. `closed`
// is needed besides `mine`: the assistant also closes cards the clerk opened (`mine: false`).
export type Authored = { wrote?: ReadonlyMap<string, ReadonlySet<string>>; closed?: ReadonlySet<string> };

export const changesBetween = (before: Fingerprint, after: Fingerprint, ours: Authored = {}): string[] => {
  const lines: string[] = [];
  const opened: Card[] = [];
  const closed: Card[] = [];

  for (const [id, card] of after) {
    const prior = before.get(id);
    const written = ours.wrote?.get(id);
    if (prior === undefined) {
      if (!card.mine) opened.push(card);
      continue;
    }
    for (const [key, value] of Object.entries(card.values)) {
      if (JSON.stringify(prior.values[key]) === JSON.stringify(value)) continue;
      if (written?.has(key) === true) continue;
      if (key === 'expanded') {
        lines.push(value === true ? `the user opened "${card.title}" and is reading it now. Its contents are in SCREEN.` : `the user collapsed "${card.title}"`);
        continue;
      }
      const who = card.mine ? `the user used "${card.title}": ` : `"${card.title}": `;
      lines.push(carries(value) ? `${who}${key} is now ${brief(value, 400)}` : `${who}${key} was cleared`);
    }
  }
  for (const [id, card] of before) if (!after.has(id) && !card.mine && ours.closed?.has(id) !== true) closed.push(card);

  // Clicking a second row `resetTo`s the canvas, so the instance id changes: without
  // this, one navigation reports as a close and an open of the same card.
  const spare = [...closed];
  for (const card of opened) {
    const match = spare.findIndex((other) => other.canvas === card.canvas && other.definitionId === card.definitionId);
    if (match >= 0) spare.splice(match, 1);
    const carried = Object.entries(card.values).filter(([, value]) => carries(value));
    lines.push(`the user opened "${card.title}" on ${card.canvas}${carried.length === 0 ? '' : ` showing ${carried.map(([key, value]) => `${key}=${brief(value, 140)}`).join(', ')}`}`);
  }
  for (const card of spare) lines.push(`the user closed "${card.title}" on ${card.canvas}`);
  return lines;
};

export const navigatedBetween = (before: Fingerprint, after: Fingerprint): boolean => {
  for (const [id, card] of after) if (!card.mine && !before.has(id)) return true;
  for (const [id, card] of before) if (!card.mine && !after.has(id)) return true;
  return false;
};
