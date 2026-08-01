import type { ActionDefinition, FetchFn } from '@niscorp/nova';
import { resolveCatalog } from '@niscorp/moss';
import { resolvePrincipal } from '@niscorp/charter';
import { TABLES } from '@atrium/db/schema';
import { ENTRIES } from '@atrium/app/vex';
import { CHARTER, ASSIGNMENTS } from '@atrium/app/charter';
import { CATALOG_DEFINITIONS } from '@atrium/app/action-catalog';
import { bundleState } from '@atrium/server/bundles';

// The id space the shell serves: core plus every synced bundle. A function, not
// a const, because the discovery sync refills `bundleState` — a just-landed
// action is known on the next turn, no restart. Ring-1 resolution must run over
// this set: `ext.*` globs match nothing in the core catalog alone.
export const definitionsNow = (): Record<string, ActionDefinition> => ({ ...CATALOG_DEFINITIONS, ...bundleState.actions });

// Ring 1, from the same resolver moss uses: the principal's granted ids, the
// ceiling nothing here can exceed. Resolved over `definitionsNow()` because a
// glob only grants ids that exist in the universe it resolves against.
export const grantedOf = (principal: string | null): readonly string[] =>
  resolveCatalog({ charter: CHARTER, assignments: ASSIGNMENTS, actions: definitionsNow() }, principal).ids;

// ── ACTIONS: the nova actions this session may place or fill ──
//
// Keyed by the ACTION id — the same id a shell uses, SCREEN prints and the menu
// carries. A slot id would be a second id space the agent cannot translate: it
// reads `desk.issue.detail` on screen, so that is what it must be able to answer.
export type AvailableAction = {
  id: string;
  title: string;
  blurb: string;
  // Every capability this action is live for here — the one thing a slot carries
  // that an action does not. Empty for most; more than one only where a single
  // surface serves several (`stay.request` is spa, housekeeping and faults). The
  // model picks one and `seedFor` refuses anything outside this set.
  capabilities: string[];
  // The slots' authored match terms, merged — the same signal the concierge
  // scores asks against, so "massage" finds the spa with no prompt lore.
  keywords: string;
  // What the OTHER slots on this action publish it as, when there are several.
  // A slot's title and blurb describe the job that slot offers, and one action
  // can be offered as more than one job — housekeeping and fault reporting are
  // the same surface over two capabilities. Keeping only the first would hide a
  // whole published purpose from the one reader that has to choose between them.
  also: { title: string; blurb: string }[];
  input: unknown;
};

type SlotRow = { slot_id?: string; action_id?: string; title?: string; blurb?: string; capability_id?: string; keywords?: string; canvas?: string };

// The audiences whose whole surface is slot-gated. The vendor's console is
// granted directly, so its actions come from the catalog instead.
const SLOTTED = new Set(['guest', 'desk', 'service', 'ops']);

// A surface the caller cannot PUT ANYWHERE is not in their vocabulary.
//
// `surface/live` returns every live slot for the audience, whatever canvas it
// belongs on — which is right for composition and wrong for a catalog:
// advertising a surface whose canvas the caller cannot place onto offers the
// model an action whose only possible use is a duplicate in the wrong column.
// If it cannot be used correctly, it does not exist.
//
// `places` empty means the caller places nothing (the `authored` profile), and
// then the catalog is only there to be FILLED — so nothing is filtered out.
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
    // Not slot-gated: granted, non-chrome actions straight from the catalog.
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

  // Several slots can resolve to one action. They merge into one entry, keeping
  // every capability and every match term, so the catalog never shows two
  // indistinguishable options.
  const byAction = new Map<string, AvailableAction>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const action = String(row.action_id ?? '');
    if (!granted.includes(action)) continue; // charter is the ceiling, always
    if (!placeable(String(row.canvas ?? ''), places)) continue; // and the screen is the other one
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

// ── QUERIES: the named vex queries this session may run ──────
//
// Derived from the seeded entries: fingerprint, intent, the context keys the DSL
// binds ($context markers, found mechanically), and the tables it reads.
//
// FILTERED BY THE CALLER. A query over a table the charter does not let this
// principal read is refused engine-side anyway, so listing it only teaches the
// model a word it cannot use — eleven of forty-nine, for a desk clerk.
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

// The tables a principal may read, from the charter's own resolver — the same
// one moss compiles the scope policy from, so this cannot disagree with what the
// engine will actually allow.
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

// Core entries plus every bundle's — the spa diary, the call sheet and the ask
// queue are as queryable as the folio, the moment their connector ships them.
// READS only: bundleState holds mutations too, but a write is never the agent's
// to run — it replays through an action a human commits.
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
