import type { OkCacheEntry } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
import type { MutationDefinition } from '@relay/vex/mutations';
import { contactsList, contactById, contactsByCompany, contactUpsert, contactDelete } from './contacts';
import { companiesList, companyById, companyUpsert, companyDelete } from './companies';
import { dealsList, dealsByOwner, dealById, dealsByCompany, dealsByContact, dealsBoard, dealsOpenByStage, dealsForecast, dealsByStatus, dealsByStage, companyOptions, stageOptions, contactOptions, dealUpsert, dealMoveStage, dealMarkWon, dealMarkLost, dealDelete } from './deals';
import { tasksMine, tasksOverdue, tasksByDeal, tasksByContact, tasksOpenCount, taskUpsert, taskSetDone, taskDelete } from './tasks';
import { activitiesByDeal, activitiesByContact, dealLineItems } from './activities';
import { actionsSearch } from './actions';
import { sidebarCounts } from './counts';

// ═══════════════════════════════════════════════════════════
// The data API = the description of Vex's PREWARMED CACHE.
//
// Vex is dynamic (a read is { intent, shape, context } → generate → cache →
// serve under a fingerprint). Relay never hits the LLM because these entries
// are seeded into the `vex_cache` table at boot under NAMED fingerprints, and
// every hand-authored endpoint replays its entry by fingerprint alone
// (`{ fingerprint, context }` on the wire — no shape, no intent). This file is
// the human-readable source of that seed (and, later, migrations).
//
// A CacheEntry IS Vex's own cache row (OkCacheEntry); the authored deltas are
// `fingerprint` (the entry's name — the single source of truth every prism
// references) and `mapping` (uncompiled Prism), which compiles to the row's
// `prism_ir`. kind/created_at are filled by the seed; seeded rows are
// `protected` so a stray write can never replace them.
// ═══════════════════════════════════════════════════════════

export type CacheEntry = Pick<OkCacheEntry, 'shape' | 'dsl' | 'intent'> & {
  fingerprint: string;
  mapping?: unknown;
};

export const ENTRIES: CacheEntry[] = [
  contactsList,
  contactById,
  contactsByCompany,
  companiesList,
  companyById,
  dealsList,
  dealsByOwner,
  dealById,
  dealsByCompany,
  dealsByContact,
  dealsBoard,
  dealsOpenByStage,
  dealsForecast,
  dealsByStatus,
  dealsByStage,
  companyOptions,
  stageOptions,
  contactOptions,
  tasksMine,
  tasksOverdue,
  tasksByDeal,
  tasksByContact,
  tasksOpenCount,
  activitiesByDeal,
  activitiesByContact,
  dealLineItems,
  actionsSearch,
  sidebarCounts,
];

// Compile every entry's mapping → prism_ir and emit the cache seed: one INSERT
// per entry into `vex_cache` (the exact columns Vex's own backend writes), keyed
// by the entry's fingerprint and marked `protected` (a mismatching request can
// never replace a seeded row — it 409s). Dollar-quoted with a `$j$` tag so the
// JSON needs no escaping. Run alongside the data seed at boot (vex/runtime.ts).
export const buildCacheSeed = async (): Promise<string> => {
  const stmts: string[] = [];
  for (const e of ENTRIES) {
    // A mapping-less entry is identity: its DSL already aliases columns to the
    // shape's field names, so `$.result` IS the result. Seed that identity IR
    // explicitly — a NULL prism_ir makes Vex's reader fall through to the LLM
    // mapper (needs a key, re-runs every load since the DSL cache-hits and the
    // generated mapping never gets stored).
    const prismIr = await compile(e.mapping ?? { $ref: '$.result' });
    const prismCol = `$j$${JSON.stringify(prismIr)}$j$::jsonb`;
    stmts.push(
      `INSERT INTO vex_cache (key, kind, intent, shape, dsl, prism_ir, created_at, protected) VALUES (` +
        `$j$${e.fingerprint}$j$, 'ok', $j$${e.intent ?? ''}$j$, ` +
        `$j$${JSON.stringify(e.shape)}$j$::jsonb, $j$${JSON.stringify(e.dsl)}$j$::jsonb, ${prismCol}, now(), true) ` +
        `ON CONFLICT (key) DO NOTHING;`,
    );
  }
  return stmts.join('\n');
};

// ═══════════════════════════════════════════════════════════
// Writes. A mutation endpoint is the write counterpart of a cache entry: the
// same declarative shape (op/table/values/where over `$context`/`$scope`),
// minus the read-only bits (intent/shape/dsl/mapping). The engine lives in
// `vex/mutations`; here we only name the endpoints an action can call by `fn`.
// ═══════════════════════════════════════════════════════════

export const MUTATIONS: Record<string, MutationDefinition> = {
  'contact.upsert': contactUpsert,
  'contact.delete': contactDelete,
  'company.upsert': companyUpsert,
  'company.delete': companyDelete,
  'task.upsert': taskUpsert,
  'task.setDone': taskSetDone,
  'task.delete': taskDelete,
  'deal.upsert': dealUpsert,
  'deal.moveStage': dealMoveStage,
  'deal.markWon': dealMarkWon,
  'deal.markLost': dealMarkLost,
  'deal.delete': dealDelete,
};
