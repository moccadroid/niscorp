import { z } from 'zod';
import type { ActionDefinition, FetchFn } from '@niscorp/nova';
import { resolvePrincipal } from '@niscorp/charter';
import { TABLES } from '@atrium/db/schema';
import { ENTRIES } from '@atrium/app/vex';
import { CHARTER, ASSIGNMENTS } from '@atrium/app/charter';
import { CATALOG_DEFINITIONS } from '@atrium/app/action-catalog';
import { bundleState } from '@atrium/server/bundles';

export const definitionsNow = (): Record<string, ActionDefinition> => ({ ...CATALOG_DEFINITIONS, ...bundleState.actions });

const CatalogSchema = z.object({ actions: z.array(z.string()) });

export const grantedOver = async (wire: FetchFn): Promise<readonly string[]> => {
  const response = await wire('/catalog');
  if (!response.ok) return [];
  const catalog = CatalogSchema.safeParse(await response.json());
  return catalog.success ? catalog.data.actions : [];
};

export type AvailableAction = {
  id: string;
  title: string;
  blurb: string;
  capabilities: string[];
  keywords: string;
  also: { title: string; blurb: string }[];
  input: unknown;
};

type SlotRow = { slot_id?: string; action_id?: string; title?: string; blurb?: string; capability_id?: string; keywords?: string; canvas?: string };

const SLOTTED = new Set(['guest', 'desk', 'service', 'ops']);

// Empty `places`: the caller places nothing and only fills, so nothing is filtered out.
const placeable = (canvas: string, places: readonly string[]): boolean => places.length === 0 || canvas === '' || places.includes(canvas);

export const loadActions = async (
  wire: FetchFn,
  audience: string,
  propertyId: string,
  stayState: string,
  granted: readonly string[],
  places: readonly string[] = [],
): Promise<AvailableAction[]> => {
  const definitions = definitionsNow();
  if (!SLOTTED.has(audience)) {
    return granted
      .filter((id) => !id.startsWith('chrome.') && id !== 'assistant' && id !== 'concierge' && id !== 'auth.login' && definitions[id] !== undefined)
      .map((id) => ({ id, title: definitions[id]?.title ?? id, blurb: definitions[id]?.description ?? '', capabilities: [], keywords: '', also: [], input: definitions[id]?.input ?? {} }));
  }

  const res = await wire('/api/surface/vex', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprint: 'surface/live', context: { propertyId, audience, stayState } }),
  });
  const rows = (await res.json()) as SlotRow[] | null;

  const byAction = new Map<string, AvailableAction>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const action = String(row.action_id ?? '');
    if (!granted.includes(action)) continue;
    if (!placeable(String(row.canvas ?? ''), places)) continue;
    const capability = String(row.capability_id ?? '');
    const existing = byAction.get(action);
    if (existing !== undefined) {
      if (capability !== '' && !existing.capabilities.includes(capability)) existing.capabilities.push(capability);
      const terms = new Set([...existing.keywords.split(/\s+/), ...String(row.keywords ?? '').split(/\s+/)].filter((term) => term !== ''));
      existing.keywords = [...terms].join(' ');
      const title = String(row.title ?? '');
      const blurb = String(row.blurb ?? '');
      if (blurb !== '' && blurb !== existing.blurb && !existing.also.some((other) => other.blurb === blurb)) existing.also.push({ title, blurb });
      continue;
    }
    byAction.set(action, {
      id: action,
      title: String(row.title ?? ''),
      blurb: String(row.blurb ?? ''),
      capabilities: capability === '' ? [] : [capability],
      keywords: String(row.keywords ?? ''),
      also: [],
      input: definitions[action]?.input ?? {},
    });
  }
  return [...byAction.values()];
};

const contextKeysOf = (dsl: unknown): string[] => {
  const found = new Set<string>();
  const json = JSON.stringify(dsl);
  for (const match of json.matchAll(/"\$context":"(\w+)"/g)) {
    const key = match[1];
    if (key !== undefined) found.add(key);
  }
  return [...found];
};

const tablesOf = (dsl: unknown): string[] => {
  const from = (dsl as { from?: unknown } | undefined)?.from;
  return Array.isArray(from) ? from.map(String) : [];
};

export type QueryEntry = { fingerprint: string; intent: string; context: string[] };

const READ_VERBS = TABLES.map((table) => `${table}.read`);

const readableTables = (principal: string | null): Set<string> => {
  const roles = principal === null ? [] : (ASSIGNMENTS[principal] ?? []);
  const tables = new Set<string>();
  for (const grant of resolvePrincipal(CHARTER, READ_VERBS, roles, 'data')) {
    const [table, verb] = String(grant).split('.');
    if (table !== undefined && verb === 'read') tables.add(table);
  }
  return tables;
};

// `'dsl' in entry` drops bundleState's mutations: a write is never the agent's to run.
export const queriesNow = (principal: string | null): QueryEntry[] => {
  const readable = readableTables(principal);
  return [...ENTRIES, ...bundleState.entries.filter((entry) => 'dsl' in entry)]
    .filter((entry) => {
      const tables = tablesOf(entry.dsl);
      return tables.length === 0 || tables.every((table) => readable.has(table));
    })
    .map((entry) => ({ fingerprint: entry.fingerprint, intent: entry.intent ?? '', context: contextKeysOf(entry.dsl) }));
};

export const queryFingerprintsNow = (principal: string | null): Set<string> => new Set(queriesNow(principal).map((query) => query.fingerprint));
