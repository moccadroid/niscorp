import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { placeable } from '../../app/action-catalog';
import type { Canvas } from '../../app/screens';
import { ENTRIES } from '../../app/vex';
import { isRecord } from './record';

export type Placeable = { id: string; description: string; schema: Record<string, unknown>; check: z.ZodType; defaults: Record<string, unknown> };
export type Read = { fingerprint: string; intent: string; shape: unknown; contextKeys: string[] };
export type Write = { fingerprint: string; intent: string; contextKeys: string[] };
export type Catalog = { actions: Placeable[]; reads: Read[]; writes: Write[] };

const contextOf = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(contextOf);
  if (!isRecord(node)) return [];
  const named = node['$context'];
  return typeof named === 'string' ? [named] : Object.values(node).flatMap(contextOf);
};

const placeableOf = (action: ActionDefinition): Placeable => {
  const schema = action.input ?? {};
  const carried = Object.keys(isRecord(schema['properties']) ? schema['properties'] : {});
  const defaults = Object.fromEntries(Object.entries(action.data ?? {}).filter(([key]) => carried.includes(key)));
  return { id: action.id, description: action.description ?? '', schema, check: z.fromJSONSchema(schema), defaults };
};

// A canvas written onto a screen holds its whole input: what it leaves out is its action's default, so a card already
// there is written into exactly as a new one would open, and keeps nothing of what it showed before.
export const opened = (canvas: Canvas, catalog: Catalog): Canvas => ({ ...canvas, input: { ...catalog.actions.find((action) => action.id === canvas.action)?.defaults, ...canvas.input } });

const catalogOf = (actions: readonly ActionDefinition[], entries: readonly (SeedEntry | SeedMutation)[]): Catalog => ({
  actions: actions.map(placeableOf),
  reads: entries.flatMap((entry) => ('dsl' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', shape: entry.shape, contextKeys: [...new Set(contextOf(entry.dsl))] }] : [])),
  writes: entries.flatMap((entry) => ('mutation' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', contextKeys: [...new Set(contextOf(entry.mutation))] }] : [])),
});

export const CATALOG: Catalog = catalogOf(placeable, ENTRIES);
