import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation, Source } from '@niscorp/vex';

export const RELOAD_CHANNEL = (actionId: string): string => `reload:${actionId}`;

const Replay = z.object({ fingerprint: z.string() }).loose();

const tablesOf = (sources: readonly Source[]): string[] => sources.flatMap((source) => (typeof source === 'string' ? [source] : tablesOf(source.query.from)));

export const tablesReadBy = (definition: ActionDefinition, entries: readonly (SeedEntry | SeedMutation)[]): string[] => {
  const tables = new Set<string>();
  for (const endpoint of Object.values(definition.endpoints ?? {})) {
    const replay = Replay.safeParse('request' in endpoint ? endpoint.request : undefined);
    if (!replay.success) continue;
    const entry = entries.find((candidate) => candidate.fingerprint === replay.data.fingerprint);
    if (entry !== undefined && 'dsl' in entry) for (const table of tablesOf(entry.dsl.from)) tables.add(table);
  }
  return [...tables];
};

export const withReload = (definition: ActionDefinition, entries: readonly (SeedEntry | SeedMutation)[]): ActionDefinition => {
  const mount = definition.lifecycle?.mount ?? [];
  if (mount.length === 0 || tablesReadBy(definition, entries).length === 0) return definition;
  return { ...definition, triggers: [...(definition.triggers ?? []), { message: RELOAD_CHANNEL(definition.id), do: mount }] };
};

const Writes = z.union([z.object({ table: z.string() }).loose(), z.array(z.object({ table: z.string() }).loose())]);

export const writtenTables = (entries: readonly (SeedEntry | SeedMutation)[]): string[] => {
  const tables = new Set<string>();
  for (const entry of entries) {
    const writes = Writes.safeParse('mutation' in entry ? entry.mutation : undefined);
    if (writes.success) for (const write of Array.isArray(writes.data) ? writes.data : [writes.data]) tables.add(write.table);
  }
  return [...tables];
};
