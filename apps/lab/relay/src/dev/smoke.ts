// Headless data-layer harness: boots the real PGlite + Vex runtime in Node and
// runs every cache entry straight through the engine, printing the cache result,
// the SQL Vex compiled, and the shaped output. Run with `pnpm --filter relay
// smoke`. Excluded from the app typecheck (src/dev).
//
// Proves: the seeded cache serves every entry (HIT, no LLM), the SQL is
// genuinely synthesized, list mappings come back as arrays, by-id details /
// aggregates as single objects (whole-set Prism).
import type { CacheEntry } from '@relay/api';
import { getVexRuntime, CURRENT_USER_ID } from '@relay/vex/runtime';
import { contactsList, contactById, contactsByCompany } from '@relay/api/contacts';
import { companiesList, companyById } from '@relay/api/companies';
import { dealsList, dealsByOwner, dealById, dealsByCompany, dealsBoard, dealsOpenByStage, dealsForecast, dealsByStatus, dealsByStage } from '@relay/api/deals';
import { tasksMine, tasksByDeal, tasksOpenCount } from '@relay/api/tasks';
import { activitiesByDeal, dealLineItems } from '@relay/api/activities';
import { actionsSearch } from '@relay/api/actions';

const checks: { def: CacheEntry; ctx?: Record<string, unknown> }[] = [
  { def: contactsList, ctx: { search: '%' } },
  { def: companiesList, ctx: { search: '%' } },
  { def: dealsList, ctx: { search: '%' } },
  { def: dealsByOwner, ctx: { ownerId: CURRENT_USER_ID, search: '%' } },
  { def: dealsBoard },
  { def: dealsOpenByStage },
  { def: dealsForecast },
  { def: dealsByStage },
  { def: companyById, ctx: { id: 'cmp_001' } },
  { def: contactById, ctx: { id: 'con_001' } },
  { def: dealById, ctx: { id: 'deal_001' } },
  { def: contactsByCompany, ctx: { companyId: 'cmp_001' } },
  { def: dealsByCompany, ctx: { companyId: 'cmp_001' } },
  { def: activitiesByDeal, ctx: { id: 'deal_001' } },
  { def: dealLineItems, ctx: { id: 'deal_001' } },
  { def: tasksByDeal, ctx: { id: 'deal_001' } },
  { def: tasksMine, ctx: { userId: CURRENT_USER_ID, search: '%' } },
  { def: dealsByStatus, ctx: { status: 'open' } },
  { def: dealsByStatus, ctx: { status: 'won' } },
  { def: tasksOpenCount },
  { def: actionsSearch, ctx: { search: '%new%' } },
];

const describe = (r: unknown): string =>
  Array.isArray(r) ? `${r.length} rows` : r !== null && typeof r === 'object' ? 'object' : `scalar ${JSON.stringify(r)}`;

const main = async (): Promise<void> => {
  const rt = await getVexRuntime();
  for (const c of checks) {
    const sql = rt.engine.compile(c.def.dsl).sql;
    const res = await rt.engine.execute({ intent: c.def.intent, shape: c.def.shape, context: c.ctx ?? {} }, { cache: 'use' });
    const sample = Array.isArray(res.result) ? (res.result[0] ?? null) : res.result;
    console.log(`\n=== ${c.def.intent} ===`);
    console.log(`cache: ${res.meta.cache.hit ? 'HIT' : 'MISS'} · ${describe(res.result)} · prismIr: ${c.def.mapping !== undefined ? 'yes' : 'no'}`);
    console.log(`SQL:   ${sql}`);
    console.log(`out:   ${JSON.stringify(sample)}`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error('SMOKE FAILED:', e);
    process.exit(1);
  });
