// Tasks toolbar. Drives the Tasks screen headlessly to prove the toolbar now
// matches the deals table: in-place search + sortable column headers (Vex's
// reserved sortBy/sortDir → ORDER BY, same cached query). The body is the
// reusable Table primitive. Run: pnpm --filter relay exec tsx src/dev/tasks-check.ts
import { shell } from '../nova/shell';
import { getVexRuntime } from '../vex/runtime';

const settle = (ms = 200): Promise<void> => new Promise((r) => setTimeout(r, ms));
const active = (): { id: string } | undefined => shell.getCanvasState('main').active;
const mainData = (): Record<string, unknown> | undefined => {
  const a = active();
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const mainAction = (): string | undefined => {
  const a = active();
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};
const rows = (): Record<string, unknown>[] => (mainData()?.['rows'] ?? []) as Record<string, unknown>[];
const titles = (): string => rows().map((r) => String(r['title'])).join('|');
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
  await getVexRuntime();
  const checks: [string, boolean][] = [];

  shell.dispatch({ type: 'ui:click', ref: 'nav-tasks' });
  await settle(320);
  checks.push([`tasks screen mounted (got ${String(mainAction())})`, mainAction() === 'tasks']);
  const all = rows().length;
  checks.push([`my open tasks loaded (got ${all})`, all > 0]);
  checks.push([`body is one Table node (got ${countComponent('Table')})`, countComponent('Table') === 1]);
  checks.push([`default sort is due-date asc (got ${String(mainData()?.['sortBy'])} ${String(mainData()?.['sortDir'])})`, mainData()?.['sortBy'] === 'tasks.due_date' && mainData()?.['sortDir'] === 'asc']);

  // Search filters in place.
  shell.dispatch({ type: 'ui:model', ref: 'search', payload: 'follow' });
  await settle(240);
  const searched = rows().length;
  checks.push([`search "follow" filters in place (got ${searched} ≤ ${all})`, searched > 0 && searched <= all]);
  shell.dispatch({ type: 'ui:model', ref: 'search', payload: '' });
  await settle(240);
  checks.push([`clearing the search restores all (got ${rows().length})`, rows().length === all]);

  // Sort by title: asc vs desc must reverse the first row, same query.
  shell.dispatch({ type: 'ui:click', ref: 'sort', payload: { sortBy: 'tasks.title', sortDir: 'asc' } });
  await settle(240);
  const ascTitles = titles();
  const ascFirst = String(rows()[0]?.['title']);
  shell.dispatch({ type: 'ui:click', ref: 'sort', payload: { sortBy: 'tasks.title', sortDir: 'desc' } });
  await settle(240);
  const descFirst = String(rows()[0]?.['title']);
  checks.push([`sort state updates (sortBy=${String(mainData()?.['sortBy'])} dir=${String(mainData()?.['sortDir'])})`, mainData()?.['sortBy'] === 'tasks.title' && mainData()?.['sortDir'] === 'desc']);
  checks.push([`title sort flips the order (asc-first "${ascFirst}" ≠ desc-first "${descFirst}")`, ascFirst !== descFirst && rows().length === all]);
  checks.push([`desc is the reverse of asc`, titles() === ascTitles.split('|').reverse().join('|')]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — the tasks toolbar searches + sorts like the deals table.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
