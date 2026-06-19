import type { OkCacheEntry } from '@niscorp/vex';
import { computeShapeHash } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
import type { MutationDefinition } from '@relay/vex/mutations';
import { contactsList, contactById, contactsByCompany, contactCreate, contactUpdate, contactDelete } from './contacts';
import { companiesList, companyById, companyCreate, companyUpdate, companyDelete } from './companies';
import { dealsList, dealsByOwner, dealById, dealsByCompany, dealsByContact, dealsBoard, dealsOpenByStage, dealsForecast, dealsByStatus, dealsByStage, companyOptions, stageOptions, contactOptions, dealCreate, dealUpdate, dealMoveStage, dealMarkWon, dealMarkLost, dealDelete } from './deals';
import { tasksMine, tasksOverdue, tasksByDeal, tasksByContact, tasksOpenCount, taskCreate, taskSetDone, taskUpdate, taskDelete } from './tasks';
import { activitiesByDeal, activitiesByContact, dealLineItems } from './activities';
import { actionsSearch } from './actions';
import { sidebarCounts } from './counts';

// ═══════════════════════════════════════════════════════════
// The data API = the description of Vex's PREWARMED CACHE.
//
// Vex is dynamic (a read is { shape, context, intent } → generate → cache →
// serve). v1 never hits the LLM because these entries are seeded into the
// `vex_cache` table at boot; Vex's normal `cache:'use'` then serves them. This
// file is the human-readable source of that seed (and, later, migrations).
//
// A CacheEntry IS Vex's own cache row (OkCacheEntry); the only authored delta is
// `mapping` (uncompiled Prism), which compiles to the row's `prism_ir`.
// kind/created_at are filled by the seed.
// ═══════════════════════════════════════════════════════════

export type CacheEntry = Pick<OkCacheEntry, 'shape' | 'dsl' | 'intent'> & { mapping?: unknown };

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
// by the shape hash. Dollar-quoted with a `$j$` tag so the JSON needs no
// escaping. Run alongside the data seed at boot (vex/runtime.ts).
export const buildCacheSeed = async (): Promise<string> => {
  const stmts: string[] = [];
  for (const e of ENTRIES) {
    const key = computeShapeHash(e.shape);
    const prismIr = e.mapping !== undefined ? await compile(e.mapping) : undefined;
    const prismCol = prismIr !== undefined ? `$j$${JSON.stringify(prismIr)}$j$::jsonb` : 'NULL';
    stmts.push(
      `INSERT INTO vex_cache (key, kind, intent, shape, dsl, prism_ir, created_at) VALUES (` +
        `$j$${key}$j$, 'ok', $j$${e.intent ?? ''}$j$, ` +
        `$j$${JSON.stringify(e.shape)}$j$::jsonb, $j$${JSON.stringify(e.dsl)}$j$::jsonb, ${prismCol}, now()) ` +
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
  'contact.create': contactCreate,
  'contact.update': contactUpdate,
  'contact.delete': contactDelete,
  'company.create': companyCreate,
  'company.update': companyUpdate,
  'company.delete': companyDelete,
  'task.create': taskCreate,
  'task.setDone': taskSetDone,
  'task.update': taskUpdate,
  'task.delete': taskDelete,
  'deal.create': dealCreate,
  'deal.update': dealUpdate,
  'deal.moveStage': dealMoveStage,
  'deal.markWon': dealMarkWon,
  'deal.markLost': dealMarkLost,
  'deal.delete': dealDelete,
};
