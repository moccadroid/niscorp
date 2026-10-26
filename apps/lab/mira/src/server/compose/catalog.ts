import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { placeable } from '../../app/action-catalog';
import { SCREENS } from '../../app/screens';
import type { Canvas, Screen } from '../../app/screens';
import { ENTRIES } from '../../app/vex';
import { isRecord, recordOf } from './record';

type Placeable = { id: string; description: string; schema: Record<string, unknown>; check: z.ZodType; defaults: Record<string, unknown> };
type Read = { fingerprint: string; intent: string; shape: unknown; contextKeys: string[] };
type Write = { fingerprint: string; intent: string; contextKeys: string[] };
export type Catalog = { actions: Placeable[]; reads: Read[]; writes: Write[] };

// An action that declares no input is opened with none.
const NO_INPUT = z.toJSONSchema(z.object({}).strict());

export const inputKeysOf = (schema: unknown): string[] => Object.keys(recordOf(recordOf(schema)['properties']));

const contextOf = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(contextOf);
  if (!isRecord(node)) return [];
  const named = node['$context'];
  return typeof named === 'string' ? [named] : Object.values(node).flatMap(contextOf);
};

const placeableOf = (action: ActionDefinition): Placeable => {
  const schema = action.input ?? NO_INPUT;
  const carried = inputKeysOf(schema);
  const defaults = Object.fromEntries(Object.entries(action.data ?? {}).filter(([key]) => carried.includes(key)));
  return { id: action.id, description: action.description ?? '', schema, check: z.fromJSONSchema(schema), defaults };
};

// A canvas written onto a screen holds its whole input: what it leaves out, or says is null, is its action's default, so
// a card already there is written into exactly as a new one would open, and keeps nothing of what it showed before.
export const opened = (canvas: Canvas, catalog: Catalog): Canvas => ({
  ...canvas,
  input: { ...catalog.actions.find((action) => action.id === canvas.action)?.defaults, ...Object.fromEntries(Object.entries(canvas.input).filter(([, value]) => value !== null)) },
});

const catalogOf = (actions: readonly ActionDefinition[], entries: readonly (SeedEntry | SeedMutation)[]): Catalog => ({
  actions: actions.map(placeableOf),
  reads: entries.flatMap((entry) => ('dsl' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', shape: entry.shape, contextKeys: [...new Set(contextOf(entry.dsl))] }] : [])),
  writes: entries.flatMap((entry) => ('mutation' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', contextKeys: [...new Set(contextOf(entry.mutation))] }] : [])),
});

export const CATALOG: Catalog = catalogOf(placeable, ENTRIES);

const DiscoverySchema = z.looseObject({ fingerprints: z.array(z.looseObject({ fingerprint: z.string() })) });

// The reads and writes vex lists for a person when they ask it: the ones their roles may use.
export const withUsable = async (catalog: Catalog, wire: FunctionSession['wire']): Promise<Catalog> => {
  const response = await wire('/api/vex');
  const listed = new Set(response.ok ? DiscoverySchema.parse(await response.json()).fingerprints.map(({ fingerprint }) => fingerprint) : []);
  return { ...catalog, reads: CATALOG.reads.filter((read) => listed.has(read.fingerprint)), writes: CATALOG.writes.filter((write) => listed.has(write.fingerprint)) };
};

export const screensHeld = (actions: readonly string[]): Screen[] => SCREENS.filter((screen) => screen.canvases.every((canvas) => actions.includes(canvas.action)));
