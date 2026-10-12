import { REF_TABLES } from '@encore/app/vex/ref-tables';
import type { FetchFn } from '@niscorp/nova';
import type { ScopePolicy } from '@niscorp/vex';
import { z } from 'zod';
import type { ContextPack, PackValue } from '@encore/app/vex/context-packs';
import type { FestivalClock } from '@encore/lib/festival-clock';
import type { Parsed } from './intent.types';

export const canRead = (policy: ScopePolicy, table: string): boolean => {
  const rule = policy.entities[table];
  if (rule === undefined) return policy.default === 'allow';
  if ('deny' in rule) return false;
  return 'public' in rule || rule.read !== undefined;
};

export const readablePacks = (policy: ScopePolicy, packs: readonly ContextPack[]): ContextPack[] => packs.filter((pack) => pack.tables.every((table) => canRead(policy, table)));

const LAST_HOUR = 23;

const valueOf = (binding: PackValue, parsed: Parsed, clock: FestivalClock): string | number => {
  if ('value' in binding) return binding.value;
  if (binding.heard === 'day') return parsed.day ?? clock.day;
  const hour = Math.min(LAST_HOUR + 1, Math.max(0, (parsed.hour ?? clock.hour) + (binding.offset ?? 0)));
  return hour * (binding.times ?? 1);
};

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

const FactRows = z.array(z.record(z.string(), z.unknown()));

export type HarvestedRow = { table: string; id: string; label: string; from: string };

export const harvestRefs = (packs: readonly ContextPack[], facts: Record<string, Record<string, unknown>>): HarvestedRow[] => {
  const found = new Map<string, HarvestedRow>();
  for (const pack of packs) {
    for (const read of pack.reads) {
      const rows = FactRows.safeParse(facts[pack.id]?.[read.name]);
      if (!rows.success) continue;
      for (const row of rows.data) {
        for (const ref of read.refs ?? []) {
          const id = row[ref.id];
          const label = row[ref.label];
          if (typeof id === 'string' && id !== '' && !found.has(`${ref.table}:${id}`)) found.set(`${ref.table}:${id}`, { table: ref.table, id, label: typeof label === 'string' ? label : id, from: pack.noun });
        }
      }
    }
  }
  return [...found.values()];
};

export const harvestRows = (rows: readonly unknown[]): HarvestedRow[] => {
  const found = new Map<string, HarvestedRow>();
  for (const row of FactRows.safeParse(rows).data ?? []) {
    for (const [table, source] of Object.entries(REF_TABLES)) {
      const id = row[source.rowKeys.id];
      const label = source.rowKeys.labels.map((key) => row[key]).find((value) => typeof value === 'string');
      if (typeof id === 'string' && id !== '' && !found.has(`${table}:${id}`)) found.set(`${table}:${id}`, { table, id, label: typeof label === 'string' ? label : id, from: 'what it looked up' });
    }
  }
  return [...found.values()];
};
