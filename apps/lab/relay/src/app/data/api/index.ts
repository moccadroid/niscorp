import type { SeedEntry, SeedMutation } from '@niscorp/vex';
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
// the human-readable source of that seed (and, later, migrations); vex's `seedCache`
// turns it into protected `vex_cache` rows at boot (dev-db + the server).
//
// A CacheEntry IS Vex's own cache row (OkCacheEntry); the authored deltas are
// `fingerprint` (the entry's name — the single source of truth every prism
// references) and `mapping` (uncompiled Prism), which compiles to the row's
// `prism_ir`. kind/created_at are filled by the seed; seeded rows are
// `protected` so a stray write can never replace them.
// ═══════════════════════════════════════════════════════════

export type CacheEntry = SeedEntry;

// A write entry is the same idea, `kind: 'mutation'`: the def lives in the
// cache under a NAMED fingerprint and the wire replays `{ fingerprint,
// context }` — the def itself never travels. Seams reference
// `<entry>.fingerprint`; checks reach the raw def via `<entry>.mutation`.
export type MutationEntry = SeedMutation;

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

// Writes are cache entries too — `kind: 'mutation'`, replayed by fingerprint,
// never sent inline. The engine lives in @niscorp/vex; this list is the
// human-readable source of the seeded write API.
export const MUTATION_ENTRIES: MutationEntry[] = [
  contactUpsert,
  contactDelete,
  companyUpsert,
  companyDelete,
  taskUpsert,
  taskSetDone,
  taskDelete,
  dealUpsert,
  dealMoveStage,
  dealMarkWon,
  dealMarkLost,
  dealDelete,
];
