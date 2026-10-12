import { shell, runtime } from './check-shell';

const settle = (ms = 300): Promise<void> => new Promise((r) => setTimeout(r, ms));
const detailRt = (): ReturnType<typeof shell.getRuntime> => {
  const a = shell.getCanvasState('main').active;
  return a !== undefined ? shell.getRuntime(a.id) : undefined;
};
const view = (): Record<string, unknown> => ((detailRt()?.getData() ?? {}) as Record<string, unknown>);
const openContact = async (id: string): Promise<void> => {
  // Only the active action reacts: a suspended list ignores the click, so
  // walk back to the list first.
  while (shell.getCanvasState('main').stack.length > 1) shell.pop('main');
  await settle(120);
  shell.dispatch({ type: 'ui:click', ref: 'row', payload: id });
  await settle(340);
};

const main = async (): Promise<void> => {
  const checks: [string, boolean][] = [];
  const one = async (sql: string): Promise<string | undefined> => ((await runtime.db.query(sql)).rows[0] as { id: string } | undefined)?.id;
  const count = async (sql: string, p: unknown[]): Promise<number> => ((await runtime.db.query(sql, p)).rows[0] as { n: number }).n;

  const strays = await count(`SELECT count(*)::int AS n FROM activities a JOIN deals d ON d.id = a.deal_id WHERE a.contact_id IS NOT NULL AND a.contact_id <> d.primary_contact_id`, []);
  checks.push([`activity↔contact is the deal's primary contact, never a bystander (strays: ${strays})`, strays === 0]);

  shell.dispatch({ type: 'ui:click', ref: 'nav-contacts' });
  await settle(320);

  const cAct = await one(`SELECT contact_id AS id FROM activities WHERE contact_id IS NOT NULL GROUP BY contact_id ORDER BY count(*) DESC LIMIT 1`);
  await openContact(cAct!);
  checks.push([`contact opened on main (got ${String(detailRt()?.definition.id)})`, detailRt()?.definition.id === 'crm.contact.view']);
  const acts = (view()['activity'] ?? []) as Record<string, unknown>[];
  const dbActs = await count('SELECT count(*)::int AS n FROM activities WHERE contact_id=$1', [cAct]);
  checks.push([`activity matches the DB (${acts.length} = min(${dbActs},12)) and is non-empty`, acts.length === Math.min(dbActs, 12) && acts.length > 0]);
  checks.push([`activity rows carry body + tone (the contact-shape, not the deal one)`, 'body' in (acts[0] ?? {}) && typeof acts[0]?.['tone'] === 'string']);
  const aDeals = (view()['deals'] ?? []) as unknown[];
  const aTasks = (view()['tasks'] ?? []) as unknown[];
  checks.push([`its deals slot (any status) equals the DB and is non-empty — the activity's source is visible`, aDeals.length === (await count('SELECT count(*)::int AS n FROM deals WHERE primary_contact_id=$1', [cAct])) && aDeals.length > 0]);
  checks.push([`its tasks slot equals the DB`, aTasks.length === (await count("SELECT count(*)::int AS n FROM tasks WHERE contact_id=$1 AND done=false AND assignee_id='usr_001'", [cAct]))]);

  const cDeal = await one(`SELECT primary_contact_id AS id FROM deals WHERE primary_contact_id IS NOT NULL GROUP BY primary_contact_id ORDER BY count(*) DESC LIMIT 1`);
  await openContact(cDeal!);
  const deals = (view()['deals'] ?? []) as Record<string, unknown>[];
  const dbDeals = await count('SELECT count(*)::int AS n FROM deals WHERE primary_contact_id=$1', [cDeal]);
  checks.push([`deals (any status) match the DB (${deals.length} = ${dbDeals}) and is non-empty`, deals.length === dbDeals && deals.length > 0]);
  checks.push([`deal rows carry value_display + stage + a status tone`, typeof deals[0]?.['value_display'] === 'string' && 'stage' in (deals[0] ?? {}) && typeof deals[0]?.['tone'] === 'string']);
  const errs: string[] = [];
  const walkErr = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walkErr);
    if (x === null || typeof x !== 'object') return;
    const n = x as { type?: string; name?: string; message?: string; children?: unknown };
    if (n.type === 'error') errs.push(`${n.name ?? '?'}: ${n.message ?? ''}`);
    if (n.children !== undefined) walkErr(n.children);
  };
  walkErr(shell.flattenRenderTree(shell.getCanvasRenderTree('main')));
  checks.push([`contact panel renders with no error nodes (${errs.join('; ') || 'none'})`, errs.length === 0]);

  const cTask = await one(`SELECT contact_id AS id FROM tasks WHERE contact_id IS NOT NULL AND done=false AND assignee_id='usr_001' GROUP BY contact_id ORDER BY count(*) DESC LIMIT 1`);
  await openContact(cTask!);
  const tasks = (view()['tasks'] ?? []) as Record<string, unknown>[];
  const dbTasks = await count("SELECT count(*)::int AS n FROM tasks WHERE contact_id=$1 AND done=false AND assignee_id='usr_001'", [cTask]);
  checks.push([`open tasks match the DB (${tasks.length} = min(${dbTasks},20)) and is non-empty`, tasks.length === Math.min(dbTasks, 20) && tasks.length > 0]);

  const company = await one(`SELECT id FROM companies WHERE EXISTS (SELECT 1 FROM deals d WHERE d.company_id = companies.id AND d.status='open') LIMIT 1`);
  shell.dispatch({ type: 'ui:click', ref: 'nav-companies' });
  await settle(320);
  shell.dispatch({ type: 'ui:click', ref: 'row', payload: company });
  await settle(340);
  checks.push([`company opened on main (got ${String(detailRt()?.definition.id)})`, detailRt()?.definition.id === 'crm.company.view']);
  const coDeals = (view()['deals'] ?? []) as Record<string, unknown>[];
  const dbCoDeals = await count("SELECT count(*)::int AS n FROM deals WHERE company_id=$1 AND status='open'", [company]);
  checks.push([`company open deals match the DB (${coDeals.length} = ${dbCoDeals})`, coDeals.length === dbCoDeals && coDeals.length > 0]);
  checks.push([`company panel has no activity slot`, view()['activity'] === undefined]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — contact + company profiles load their related records; distinct shapes, no collisions.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
