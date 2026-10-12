import { evaluate } from '@niscorp/prism';
import type { QueryRequest } from '@niscorp/vex';
import type { CacheEntry } from '@relay/app/vex';
import { getVexRuntime } from '@relay/dev/engine';
import { todayStr } from '@relay/lib/date';

const CURRENT_USER = 'usr_001';
import { CHARTER, ASSIGNMENTS } from '@relay/app/charter';
import { resolvePrincipal } from '@niscorp/charter';
import { CATALOG_DEFINITIONS } from '@relay/app/action-catalog';
import { contactsList, contactById, contactsByCompany } from '@relay/app/vex/contacts.entries';
import { companiesList, companyById } from '@relay/app/vex/companies.entries';
import { dealsList, dealsByOwner, dealById, dealsByCompany, dealsBoard, dealsOpenByStage, dealsForecast, dealsByStatus, dealsByStage } from '@relay/app/vex/deals.entries';
import { tasksMine, tasksOverdue, tasksByDeal, tasksOpenCount } from '@relay/app/vex/tasks.entries';
import { activitiesByDeal, dealLineItems } from '@relay/app/vex/activities.entries';
import { actionsSearch } from '@relay/app/vex/actions.entries';
import { sidebarCounts } from '@relay/app/vex/counts.entries';
import { listContactsPrism } from '@relay/app/actions/domains/contact/contacts.prism';
import { contactByIdPrism } from '@relay/app/actions/domains/contact/contact.prism';
import { listCompaniesPrism } from '@relay/app/actions/domains/company/companies.prism';
import { companyByIdPrism, companyContactsPrism, companyDealsPrism } from '@relay/app/actions/domains/company/company.prism';
import { listDealsPrism } from '@relay/app/actions/domains/deal/deals.prism';
import { dealByIdPrism, dealActivitiesPrism, dealLineItemsPrism, dealTasksPrism } from '@relay/app/actions/domains/deal/deal.prism';
import { listTasksPrism } from '@relay/app/actions/domains/task/tasks.prism';
import { sidebarCountsPrism } from '@relay/app/actions/chrome/sidebar.prism';
import { topbarSearchPrism } from '@relay/app/actions/chrome/topbar.prism';

type Check = {
  def: CacheEntry;
  prism: unknown;
  state?: Record<string, unknown>;
  mayBeEmpty?: boolean;
};

// Prism `$ref` is strict, so every key a prism references must be in its state.
const checks: Check[] = [
  { def: contactsList, prism: listContactsPrism, state: { sortBy: 'contacts.last_name', sortDir: 'asc' } },
  { def: companiesList, prism: listCompaniesPrism, state: { sortBy: 'companies.name', sortDir: 'asc' } },
  { def: dealsList, prism: listDealsPrism, state: { ownerId: '', sortBy: 'deals.created_at', sortDir: 'desc' } },
  { def: dealsByOwner, prism: listDealsPrism, state: { ownerId: 'me', sortBy: 'deals.created_at', sortDir: 'desc' } },
  // Static replays: plain JSON bodies in the actions, mirrored here.
  { def: dealsBoard, prism: { fingerprint: dealsBoard.fingerprint, context: {} } },
  { def: dealsOpenByStage, prism: { fingerprint: dealsOpenByStage.fingerprint, context: {} } },
  { def: dealsForecast, prism: { fingerprint: dealsForecast.fingerprint, context: {} } },
  { def: dealsByStage, prism: { fingerprint: dealsByStage.fingerprint, context: {} } },
  { def: companyById, prism: companyByIdPrism, state: { id: 'cmp_001' } },
  { def: contactById, prism: contactByIdPrism, state: { id: 'con_001' } },
  { def: dealById, prism: dealByIdPrism, state: { id: 'deal_001' } },
  { def: contactsByCompany, prism: companyContactsPrism, state: { id: 'cmp_001' } },
  { def: dealsByCompany, prism: companyDealsPrism, state: { id: 'cmp_001' } },
  { def: activitiesByDeal, prism: dealActivitiesPrism, state: { id: 'deal_001' } },
  { def: dealLineItems, prism: dealLineItemsPrism, state: { id: 'deal_001' }, mayBeEmpty: true },
  { def: tasksByDeal, prism: dealTasksPrism, state: { id: 'deal_001' }, mayBeEmpty: true },
  { def: tasksMine, prism: listTasksPrism, state: { scope: 'open', sortBy: 'tasks.due_date', sortDir: 'asc' } },
  { def: tasksOverdue, prism: listTasksPrism, state: { scope: 'overdue', sortBy: 'tasks.due_date', sortDir: 'asc' } },
  { def: dealsByStatus, prism: { fingerprint: dealsByStatus.fingerprint, context: { status: 'open' } } },
  { def: dealsByStatus, prism: { fingerprint: dealsByStatus.fingerprint, context: { status: 'won' } } },
  { def: tasksOpenCount, prism: { fingerprint: tasksOpenCount.fingerprint, context: {} } },
  { def: sidebarCounts, prism: sidebarCountsPrism },
  // `allowedIds` is what the shell seeds into the topbar at boot: the
  // principal's resolved charter grant.
  { def: actionsSearch, prism: topbarSearchPrism, state: { search: 'new', allowedIds: [...resolvePrincipal(CHARTER, Object.keys(CATALOG_DEFINITIONS), [...(ASSIGNMENTS[CURRENT_USER] ?? ['public'])])] } },
];

const describe = (r: unknown): string =>
  Array.isArray(r) ? `${r.length} rows` : r !== null && typeof r === 'object' ? 'object' : `scalar ${JSON.stringify(r)}`;

const main = async (): Promise<void> => {
  const rt = await getVexRuntime();
  let failures = 0;

  for (const c of checks) {
    const source = { search: '', userId: CURRENT_USER, today: todayStr(), ...c.state };
    const request = evaluate(c.prism, source) as QueryRequest;
    const sql = rt.engine.compile(c.def.dsl).sql;
    const res = await rt.engine.execute(request, { scope: { userId: CURRENT_USER } });

    const problems: string[] = [];
    if (res.meta.cache.hit !== true) problems.push('cache MISS');
    if (res.meta.cache.fingerprint !== c.def.fingerprint) {
      problems.push(`fingerprint "${res.meta.cache.fingerprint ?? '—'}" ≠ "${c.def.fingerprint}"`);
    }
    const missing = res.meta.missingContext ?? [];
    if (missing.length > 0) problems.push(`missing context: ${missing.join(', ')}`);
    if (Array.isArray(c.def.shape) !== Array.isArray(res.result)) problems.push('envelope mismatch (array vs single)');
    if (Array.isArray(res.result) && res.result.length === 0 && c.mayBeEmpty !== true) problems.push('0 rows from a seeded read');

    const ok = problems.length === 0;
    if (!ok) failures += 1;
    const sample = Array.isArray(res.result) ? (res.result[0] ?? null) : res.result;
    console.log(`\n${ok ? '[pass]' : '[FAIL]'} ${c.def.fingerprint} — ${c.def.intent ?? ''}`);
    if (!ok) console.log(`  ✗ ${problems.join(' · ')}`);
    console.log(`  ${describe(res.result)} · prismIr: ${c.def.mapping !== undefined ? 'yes' : 'no'}`);
    console.log(`  SQL: ${sql}`);
    console.log(`  out: ${JSON.stringify(sample)}`);
  }

  console.log(failures === 0 ? `\nOK — ${checks.length} reads replayed through their screen prisms.` : `\nFAIL — ${failures} of ${checks.length} checks.`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e: unknown) => {
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});
