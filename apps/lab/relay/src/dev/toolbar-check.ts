import { shell, runtime } from './check-shell';

const settle = (ms = 160): Promise<void> => new Promise((r) => setTimeout(r, ms));
const active = (): { id: string } | undefined => shell.getCanvasState('main').active;
const mainData = (): Record<string, unknown> | undefined => {
  const a = active();
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const mainAction = (): string | undefined => {
  const a = active();
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};
const rows = (): unknown[] => (mainData()?.['rows'] ?? []) as unknown[];

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
const modalAction = (): string | undefined => {
  const a = shell.getCanvasState('modal').active;
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};

const main = async (): Promise<void> => {
  const checks: [string, boolean][] = [];

  shell.dispatch({ type: 'ui:click', ref: 'nav-deals' });
  await settle(300);
  checks.push([`deals screen mounted (got ${String(mainAction())})`, mainAction() === 'crm.deals']);
  checks.push([`all deals loaded (got ${rows().length})`, rows().length === 120]);

  shell.dispatch({ type: 'ui:model', ref: 'search', payload: 'acme' });
  await settle(240);
  const searched = rows().length;
  checks.push([`search "acme" filters the list (got ${searched})`, searched > 0 && searched < 120]);

  shell.dispatch({ type: 'ui:model', ref: 'search', payload: '' });
  await settle(240);
  checks.push([`clearing the search restores all (got ${rows().length})`, rows().length === 120]);

  shell.dispatch({ type: 'ui:click', ref: 'tab', payload: 'me' });
  await settle(240);
  checks.push([`My-deals tab sets ownerId (got ${String(mainData()?.['ownerId'])})`, mainData()?.['ownerId'] === 'me']);
  const mine = rows().length;
  checks.push([`My deals is a non-empty subset (got ${mine})`, mine > 0 && mine < 120]);

  shell.dispatch({ type: 'ui:model', ref: 'search', payload: 'a' });
  await settle(240);
  const mineFiltered = rows().length;
  checks.push([`search composes with the tab (got ${mineFiltered} ≤ ${mine})`, mineFiltered > 0 && mineFiltered <= mine]);

  shell.dispatch({ type: 'ui:model', ref: 'search', payload: '' });
  shell.dispatch({ type: 'ui:click', ref: 'tab', payload: '' });
  await settle(240);
  checks.push([`All tab restores the full list (got ${rows().length})`, rows().length === 120]);

  checks.push([`body is one Table node (got ${countComponent('Table')})`, countComponent('Table') === 1]);

  shell.dispatch({ type: 'ui:click', ref: 'sort', payload: { sortBy: 'deals.value', sortDir: 'desc' } });
  await settle(220);
  const descFirst = (rows()[0] as Record<string, unknown> | undefined)?.['value'];
  shell.dispatch({ type: 'ui:click', ref: 'sort', payload: { sortBy: 'deals.value', sortDir: 'asc' } });
  await settle(220);
  checks.push([`sort updates state (sortBy=${String(mainData()?.['sortBy'])} dir=${String(mainData()?.['sortDir'])})`, mainData()?.['sortBy'] === 'deals.value' && mainData()?.['sortDir'] === 'asc']);
  const ascFirst = (rows()[0] as Record<string, unknown> | undefined)?.['value'];
  checks.push([`sort flips the order numerically (max ${String(descFirst)} ≥ min ${String(ascFirst)})`, typeof descFirst === 'number' && typeof ascFirst === 'number' && descFirst >= ascFirst && descFirst !== ascFirst && rows().length === 120]);
  // restore the default sort so the menu checks below are unaffected
  shell.dispatch({ type: 'ui:click', ref: 'sort', payload: { sortBy: 'deals.created_at', sortDir: 'desc' } });
  await settle(180);

  const firstRow = rows()[0] as Record<string, unknown>;
  const firstId = firstRow?.['deal_id'];
  shell.dispatch({ type: 'ui:click', ref: 'menu-open', payload: firstId });
  await settle(80);
  checks.push([`row ⋯ opens its menu (menuOpenId=${String(mainData()?.['menuOpenId'])})`, mainData()?.['menuOpenId'] === firstId && firstId !== undefined]);

  shell.dispatch({ type: 'ui:click', ref: 'row-open', payload: firstRow });
  await settle(160);
  checks.push([`"Open" drills into the deal workspace (got ${String(mainAction())})`, mainAction() === 'crm.deal.view']);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — in-list search + All/Mine tabs reactively re-run the query.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
