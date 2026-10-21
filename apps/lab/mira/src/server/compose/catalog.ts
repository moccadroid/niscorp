import type { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { barsAction, barsInput } from '../../app/actions/rows/bars.action';
import { formAction, formInput } from '../../app/actions/rows/form.action';
import { statAction, statInput } from '../../app/actions/rows/stat.action';
import { tableAction, tableInput } from '../../app/actions/rows/table.action';
import { ENTRIES } from '../../app/vex';

// What an answer is composed from: the actions the model may place, each with the input it is opened with; the reads
// they show, with the rows each answers; and the writes a form saves through. `context` is the values a read or a
// write is asked with.
export type Placeable = { id: string; description: string; input: z.ZodType; schema: unknown };
export type Read = { fingerprint: string; intent: string; shape: unknown; context: string[] };
export type Write = { fingerprint: string; intent: string; context: string[] };
export type Catalog = { actions: Placeable[]; reads: Read[]; writes: Write[] };

const contextOf = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(contextOf);
  if (node === null || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  return typeof record['$context'] === 'string' ? [record['$context']] : Object.values(record).flatMap(contextOf);
};

export const placeable = (action: ActionDefinition, input: z.ZodType): Placeable => ({ id: action.id, description: action.description ?? '', input, schema: action.input });

export const catalogOf = (actions: Placeable[], entries: readonly (SeedEntry | SeedMutation)[]): Catalog => ({
  actions,
  reads: entries.flatMap((entry) => ('dsl' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', shape: entry.shape, context: [...new Set(contextOf(entry.dsl))] }] : [])),
  writes: entries.flatMap((entry) => ('mutation' in entry ? [{ fingerprint: entry.fingerprint, intent: entry.intent ?? '', context: [...new Set(contextOf(entry.mutation))] }] : [])),
});

export const CATALOG: Catalog = catalogOf([placeable(tableAction, tableInput), placeable(statAction, statInput), placeable(barsAction, barsInput), placeable(formAction, formInput)], ENTRIES);
