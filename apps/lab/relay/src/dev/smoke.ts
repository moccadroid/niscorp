// Headless data-layer harness: boots the real PGlite + Vex runtime in Node and
// runs every read the way the APP runs it — each check evaluates the screen's
// own prism (the same seam the shell's transform socket evaluates) against
// screen state, sends the resulting `{ fingerprint, context }` through the
// engine, and asserts the replay: cache HIT on the intended fingerprint, no
// missing context, the right envelope, and rows where the seed guarantees
// them. Run with `pnpm --filter relay smoke`. Excluded from the app typecheck
// (src/dev).
import { evaluate } from '@niscorp/prism';
import type { QueryRequest } from '@niscorp/vex';
import type { CacheEntry } from '@relay/api';
import { getVexRuntime, todayStr } from '@relay/vex/runtime';

// The user the replays run as — smoke drives the ENGINE directly with an
// explicit scope (the app derives its scope from the session token).
const CURRENT_USER = 'usr_001';
import { CHARTER, rolesOf, resolvePrincipal } from '@relay/charter';
import { CATALOG_DEFINITIONS } from '@relay/nova/shell/actions';
import { contactsList, contactById, contactsByCompany } from '@relay/api/contacts';
import { companiesList, companyById } from '@relay/api/companies';
import { dealsList, dealsByOwner, dealById, dealsByCompany, dealsBoard, dealsOpenByStage, dealsForecast, dealsByStatus, dealsByStage } from '@relay/api/deals';
import { tasksMine, tasksOverdue, tasksByDeal, tasksOpenCount } from '@relay/api/tasks';
import { activitiesByDeal, dealLineItems } from '@relay/api/activities';
import { actionsSearch } from '@relay/api/actions';
import { sidebarCounts } from '@relay/api/counts';
import { listContactsPrism } from '@relay/nova/domains/contact/contacts.prism';
import { contactByIdPrism } from '@relay/nova/domains/contact/contact.prism';
import { listCompaniesPrism } from '@relay/nova/domains/company/companies.prism';
import { companyByIdPrism, companyContactsPrism, companyDealsPrism } from '@relay/nova/domains/company/company.prism';
import { listDealsPrism } from '@relay/nova/domains/deal/deals.prism';
import { dealByIdPrism, dealActivitiesPrism, dealLineItemsPrism, dealTasksPrism } from '@relay/nova/domains/deal/deal.prism';
import { listTasksPrism } from '@relay/nova/domains/task/tasks.prism';
import { sidebarCountsPrism } from '@relay/nova/chrome/sidebar.prism';
import { topbarSearchPrism } from '@relay/nova/chrome/topbar.prism';

type Check = {
  def: CacheEntry; // the entry the prism must resolve to
  prism: unknown; // the screen's request seam
  state?: Record<string, unknown>; // screen state beyond the ambient defaults
  mayBeEmpty?: boolean; // the seed doesn't guarantee rows for this read
};

// Screen state mirrors what the shell provides: action-data defaults
// (`search: ''`, sort defaults, tab scopes, opened ids) plus the ambient
// context the transform socket folds into every source (`userId`, `today`).
// Prism `$ref` is strict, so every key a list prism references must be here —
// exactly as the action's `data` guarantees in the app.
const checks: Check[] = [
  { def: contactsList, prism: listContactsPrism, state: { sortBy: 'contacts.last_name', sortDir: 'asc' } },
  { def: companiesList, prism: listCompaniesPrism, state: { sortBy: 'companies.name', sortDir: 'asc' } },
  { def: dealsList, prism: listDealsPrism, state: { ownerId: '', sortBy: 'deals.created_at', sortDir: 'desc' } },
  { def: dealsByOwner, prism: listDealsPrism, state: { ownerId: 'me', sortBy: 'deals.created_at', sortDir: 'desc' } },
  // Static replays — plain JSON bodies in the actions (no seam), mirrored here.
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
  // `allowedIds` is what the shell seeds into the topbar at boot — the
  // principal's resolved charter grant, derived here the same way.
  { def: actionsSearch, prism: topbarSearchPrism, state: { search: 'new', allowedIds: [...resolvePrincipal(CHARTER, Object.keys(CATALOG_DEFINITIONS), rolesOf(CURRENT_USER))] } },
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

    // The assertions that keep this harness honest: the prism resolved to the
    // intended entry, the replay was warm, every SQL parameter was bound, the
    // envelope matches the entry's shape, and seeded reads actually return data.
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
