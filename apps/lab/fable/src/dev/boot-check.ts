// Boot + reads. Proves the data layer end-to-end: every prewarmed entry
// compiles and executes as a cache HIT (no LLM in this app), then the real
// shell mounts and the list/stat reads land in the todos action's data,
// matching the seed's buckets. Run: pnpm --filter fable check:boot
import { ENTRIES } from '../api';
import { getVexRuntime, CURRENT_DATE } from '../vex/runtime';
import { SEED_COUNTS } from '../vex/seed';
import { shell } from '../nova/shell';

const settle = (ms = 300): Promise<void> => new Promise((r) => setTimeout(r, ms));
const active = (canvas: string): { id: string } | undefined => shell.getCanvasState(canvas).active;
const dataOf = (canvas: string): Record<string, unknown> | undefined => {
  const a = active(canvas);
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const rows = (): Record<string, unknown>[] => {
  const r = dataOf('main')?.['rows'];
  return Array.isArray(r) ? (r as Record<string, unknown>[]) : [];
};
const stats = (): Record<string, unknown> => {
  const s = dataOf('main')?.['stats'];
  return s !== null && typeof s === 'object' ? (s as Record<string, unknown>) : {};
};
const countComponent = (name: string): number => {
  let n = 0;
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x === null || typeof x !== 'object') return;
    const node = x as { type?: string; name?: string; children?: unknown };
    if (node.type === 'component' && node.name === name) n += 1;
    if (node.children !== undefined) walk(node.children);
  };
  walk(shell.flattenRenderTree(shell.getCanvasRenderTree('main')));
  return n;
};

const main = async (): Promise<void> => {
  const { engine } = await getVexRuntime();
  const checks: [string, boolean][] = [];

  // Data layer: every entry compiles and cache-hits with real rows.
  const context = { today: CURRENT_DATE, q: '%%' };
  for (const e of ENTRIES) {
    const sql = engine.compile(e.dsl).sql;
    const res = await engine.execute({ fingerprint: e.fingerprint, context });
    const result: unknown = res.result;
    const okShape = Array.isArray(e.shape) ? Array.isArray(result) : result !== null && typeof result === 'object';
    checks.push([`entry "${e.intent ?? '?'}" compiles + serves from cache (${sql.length} chars of SQL)`, okShape]);
  }

  // The shell booted with the topbar and the todos list mounted.
  await settle(500);
  checks.push([`topbar mounted`, shell.getRuntime(active('topbar')?.id ?? '')?.definition.id === 'topbar']);
  checks.push([`todos mounted on main`, shell.getRuntime(active('main')?.id ?? '')?.definition.id === 'todos']);
  checks.push([`loading cleared after mount load`, dataOf('main')?.['loading'] === false]);
  checks.push([`body is one Table node (got ${countComponent('Table')})`, countComponent('Table') === 1]);
  checks.push([`open rows match seed (got ${rows().length}, want ${SEED_COUNTS.open})`, rows().length === SEED_COUNTS.open]);
  const s = stats();
  const statOk =
    Number(s['open']) === SEED_COUNTS.open &&
    Number(s['due_today']) === SEED_COUNTS.dueToday &&
    Number(s['overdue']) === SEED_COUNTS.overdue &&
    Number(s['done']) === SEED_COUNTS.done;
  checks.push([`stats match seed (got ${JSON.stringify(s)})`, statOk]);

  // Scope tabs read their own prewarmed shapes.
  shell.dispatch({ type: 'ui:click', ref: 'tab', payload: 'today' });
  await settle();
  checks.push([`Today scope = due today + overdue (got ${rows().length}, want ${SEED_COUNTS.today})`, rows().length === SEED_COUNTS.today]);
  const overdueFlags = rows().filter((r) => r['overdue'] === true).length;
  checks.push([`overdue rows flagged in Today (got ${overdueFlags}, want ${SEED_COUNTS.overdue})`, overdueFlags === SEED_COUNTS.overdue]);
  shell.dispatch({ type: 'ui:click', ref: 'tab', payload: 'done' });
  await settle();
  checks.push([`Done scope (got ${rows().length}, want ${SEED_COUNTS.done})`, rows().length === SEED_COUNTS.done]);

  // Search re-runs the same read in place.
  shell.dispatch({ type: 'ui:click', ref: 'tab', payload: 'open' });
  await settle();
  shell.dispatch({ type: 'ui:model', ref: 'search', payload: 'domain' });
  await settle();
  checks.push([`search "domain" filters in place (got ${rows().length})`, rows().length === 1 && rows()[0]?.['title'] === 'Renew the domain']);
  shell.dispatch({ type: 'ui:model', ref: 'search', payload: '' });
  await settle();
  checks.push([`clearing the search restores all (got ${rows().length})`, rows().length === SEED_COUNTS.open]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '[pass]' : '[fail]'} ${label}`);
  }
  console.log(ok ? '\nOK — boot, prewarmed reads, scopes and search all serve from the cache.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
