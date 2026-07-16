import type { OkCacheEntry, MutationDefinition } from '@niscorp/vex';
import { lintMutation } from '@niscorp/vex';
import { compile } from '@niscorp/prism';
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

// A write entry is the same idea, `kind: 'mutation'`: the def lives in the
// cache under a NAMED fingerprint and the wire replays `{ fingerprint,
// context }` — the def itself never travels. Seams reference
// `<entry>.fingerprint`; checks reach the raw def via `<entry>.mutation`.
export type MutationEntry = {
  fingerprint: string;
  intent: string;
  mutation: MutationDefinition;
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
  // Mutations ride the same table: the def in the dsl slot, discriminated by
  // kind. The authoring lint runs HERE — an unkeyed update/delete never
  // reaches the seed ("if it boots, it's coherent" for writes).
  for (const m of MUTATION_ENTRIES) {
    const issues = lintMutation(m.mutation);
    if (issues.length > 0) {
      throw new Error(`Mutation seed "${m.fingerprint}" fails the authoring lint:\n  ${issues.join('\n  ')}`);
    }
    stmts.push(
      `INSERT INTO vex_cache (key, kind, intent, dsl, created_at, protected) VALUES (` +
        `$j$${m.fingerprint}$j$, 'mutation', $j$${m.intent}$j$, ` +
        `$j$${JSON.stringify(m.mutation)}$j$::jsonb, now(), true) ` +
        `ON CONFLICT (key) DO NOTHING;`,
    );
  }
  return stmts.join('\n');
};
