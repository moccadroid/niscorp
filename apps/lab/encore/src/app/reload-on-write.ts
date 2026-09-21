import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation, Source } from '@niscorp/vex';

// A CARD RE-READS WHEN WHAT IT SHOWS IS WRITTEN — every card, by one rule.
//
// Seen live, and the worst thing the room has done: a critical alert reading
// "Food Court 96%" sat on top of a gauge still showing 93%. The gauge had loaded
// when it mounted and had no reason to load again. A stale number under an alert
// does not cost the operator one reading; it costs them the room.
//
// The first version of this was per card and by hand: a form emitted
// `lineup-changed` when it was submitted, and whichever cards somebody had
// remembered to teach listened. That covers a write made BY A FORM IN THIS ROOM,
// on the cards somebody remembered — and nothing a feed writes, which since
// scene 4 is most of what changes. So it is replaced, not extended:
//
//   · WHICH TABLES A CARD READS is derived here, from the entries its own
//     endpoints replay (`request.fingerprint` → the seeded query → its `from`).
//     Nobody lists them, so nobody can forget one.
//   · WHEN a table is written, moss says so (a row-less reaction); the server
//     publishes `reload:<action id>` into each live shell for the actions that
//     read it and have a card up — at most once per card per half second
//     (server/watch/reload.ts).
//   · WHAT a card does about it is re-run its own mount steps: the same loads,
//     with the same follow-ons, that made it correct the first time. The trigger
//     is composed here, onto every definition, so no card carries one.
//
// In place, always: a reload re-reads into the instance that is there.

export const RELOAD_CHANNEL = (actionId: string): string => `reload:${actionId}`;

const Replay = z.object({ fingerprint: z.string() }).loose();

const tablesOf = (sources: readonly Source[]): string[] => sources.flatMap((source) => (typeof source === 'string' ? [source] : tablesOf(source.query.from)));

// Every table any read endpoint of this action touches.
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

// The definition, listening. A card with nothing to re-read, or no mount steps
// to re-run, is returned as it was.
export const withReload = (definition: ActionDefinition, entries: readonly (SeedEntry | SeedMutation)[]): ActionDefinition => {
  const mount = definition.lifecycle?.mount ?? [];
  if (mount.length === 0 || tablesReadBy(definition, entries).length === 0) return definition;
  return { ...definition, triggers: [...(definition.triggers ?? []), { message: RELOAD_CHANNEL(definition.id), do: mount }] };
};

// Every table a mutation in the app can write: what the server asks moss to
// tell it about.
const Writes = z.union([z.object({ table: z.string() }).loose(), z.array(z.object({ table: z.string() }).loose())]);

export const writtenTables = (entries: readonly (SeedEntry | SeedMutation)[]): string[] => {
  const tables = new Set<string>();
  for (const entry of entries) {
    const writes = Writes.safeParse('mutation' in entry ? entry.mutation : undefined);
    if (writes.success) for (const write of Array.isArray(writes.data) ? writes.data : [writes.data]) tables.add(write.table);
  }
  return [...tables];
};
