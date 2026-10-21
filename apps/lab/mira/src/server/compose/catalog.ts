import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { GUIDE } from '../../app/actions/guide/guide.actions';
import { ENTRIES } from '../../app/vex';
import { isRecord } from './record';

export type Placeable = { id: string; description: string; schema: Record<string, unknown>; check: z.ZodType };
export type Read = { fingerprint: string; intent: string; shape: unknown; contextKeys: string[] };
export type Write = { fingerprint: string; intent: string; contextKeys: string[] };
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

const catalogOf = (actions: readonly ActionDefinition[], entries: readonly (SeedEntry | SeedMutation)[]): Catalog => ({
  actions: actions.map(placeable),
  reads: entries.flatMap((entry) => ('dsl' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', shape: entry.shape, contextKeys: [...new Set(contextOf(entry.dsl))] }] : [])),
  writes: entries.flatMap((entry) => ('mutation' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', contextKeys: [...new Set(contextOf(entry.mutation))] }] : [])),
});

export const CATALOG: Catalog = catalogOf(GUIDE, ENTRIES);
