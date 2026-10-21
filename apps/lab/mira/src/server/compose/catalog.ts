import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { barsAction } from '../../app/actions/rows/bars.action';
import { formAction } from '../../app/actions/rows/form.action';
import { statAction } from '../../app/actions/rows/stat.action';
import { tableAction } from '../../app/actions/rows/table.action';
import { ENTRIES } from '../../app/vex';
import { isRecord } from './record';

// `context` is the values a read or a write is asked with.
export type Placeable = { id: string; description: string; schema: Record<string, unknown>; check: z.ZodType };
export type Read = { fingerprint: string; intent: string; shape: unknown; context: string[] };
export type Write = { fingerprint: string; intent: string; context: string[] };
export type Catalog = { actions: Placeable[]; reads: Read[]; writes: Write[] };

const contextOf = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(contextOf);
  if (!isRecord(node)) return [];
  const named = node['$context'];
  return typeof named === 'string' ? [named] : Object.values(node).flatMap(contextOf);
};

const placeable = (action: ActionDefinition): Placeable => {
  const schema = action.input ?? {};
  return { id: action.id, description: action.description ?? '', schema, check: z.fromJSONSchema(schema) };
};

export const catalogOf = (actions: readonly ActionDefinition[], entries: readonly (SeedEntry | SeedMutation)[]): Catalog => ({
  actions: actions.map(placeable),
  reads: entries.flatMap((entry) => ('dsl' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', shape: entry.shape, context: [...new Set(contextOf(entry.dsl))] }] : [])),
  writes: entries.flatMap((entry) => ('mutation' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', context: [...new Set(contextOf(entry.mutation))] }] : [])),
});

export const CATALOG: Catalog = catalogOf([tableAction, statAction, barsAction, formAction], ENTRIES);
