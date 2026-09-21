import type { FetchFn } from '@niscorp/nova';
import type { ScopePolicy } from '@niscorp/vex';
import { z } from 'zod';
import type { ContextPack, PackValue } from '@encore/app/vex/context-packs';
import type { FestivalClock } from '@encore/lib/festival-clock';
import type { Parsed } from './intent.types';

// RUNNING A CONTEXT PACK. A pack is data (app/vex/context-packs.ts); this is the
// dozen lines that turn one into rows — vex replays over the session's own
// wire, the same path a card's load takes and under the same policy.

export const canRead = (policy: ScopePolicy, table: string): boolean => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'allow';
  if ('deny' in rule) return false;
  return 'public' in rule || rule.read !== undefined;
};

// The packs this principal may be ASKED about. A pack over a table their policy
// refuses is never a question — not asked and then denied, never asked — which
// is the action rule again: the model cannot choose what is not offered.
export const readablePacks = (policy: ScopePolicy, packs: readonly ContextPack[]): ContextPack[] => packs.filter((pack) => pack.tables.every((table) => canRead(policy, table)));

const LAST_HOUR = 23;

const valueOf = (binding: PackValue, parsed: Parsed, clock: FestivalClock): string | number => {
  if ('value' in binding) return binding.value;
  if (binding.heard === 'day') return parsed.day ?? clock.day;
  const hour = Math.min(LAST_HOUR + 1, Math.max(0, (parsed.hour ?? clock.hour) + (binding.offset ?? 0)));
  return hour * (binding.times ?? 1);
};

// Rows by pack id, then by read name, for the packs named. A read that fails is
// simply absent: the text model is told less, never something made up in its
// place.
export const readPacks = async (wire: FetchFn, packs: readonly ContextPack[], parsed: Parsed, clock: FestivalClock): Promise<Record<string, Record<string, unknown>>> => {
  const facts: Record<string, Record<string, unknown>> = {};
  for (const pack of packs) {
    const rows: Record<string, unknown> = {};
    for (const read of pack.reads) {
      const context = Object.fromEntries(Object.entries(read.context).map(([key, binding]) => [key, valueOf(binding, parsed, clock)]));
      const response = await wire('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: read.fingerprint, context }) });
      if (response.ok) rows[read.name] = await response.json();
    }
    if (Object.keys(rows).length > 0) facts[pack.id] = rows;
  }
  return facts;
};

// THE ROWS A SET OF FACTS IS ABOUT. A pack's reads declare which keys of their
// rows are ids of which table (`refs`); this collects them, with the words that
// name them, so an answer written from those facts may name those rows — and so
// may a later turn of the same thread.
const FactRows = z.array(z.record(z.string(), z.unknown()));

export const harvestRefs = (packs: readonly ContextPack[], facts: Record<string, Record<string, unknown>>): { table: string; id: string; label: string }[] => {
  const found = new Map<string, { table: string; id: string; label: string }>();
  for (const pack of packs) {
    for (const read of pack.reads) {
      const rows = FactRows.safeParse(facts[pack.id]?.[read.name]);
      if (!rows.success) continue;
      for (const row of rows.data) {
        for (const ref of read.refs ?? []) {
          const id = row[ref.id];
          const label = row[ref.label];
          if (typeof id === 'string' && id !== '') found.set(`${ref.table}:${id}`, { table: ref.table, id, label: typeof label === 'string' ? label : id });
        }
      }
    }
  }
  return [...found.values()];
};
