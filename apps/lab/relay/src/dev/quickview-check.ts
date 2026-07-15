// Headless check for the action search → quickview flow:
//  - a create opens as the form modal,
//  - a screen opens as a QUICKVIEW on the modal canvas (not a main navigation),
//  - the quickview's Open-fullscreen navigates main to that action carrying its
//    already-loaded data.
import { shell } from './check-shell';
import { getVexRuntime } from '../vex/runtime';

const settle = (ms = 120): Promise<void> => new Promise((r) => setTimeout(r, ms));
const dataOf = (canvas: string): Record<string, unknown> | undefined => {
  const a = shell.getCanvasState(canvas).active;
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const actionOf = (canvas: string): string | undefined => {
  const a = shell.getCanvasState(canvas).active;
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};
const search = async (q: string): Promise<void> => {
  shell.dispatch({ type: 'ui:model', ref: 'search', payload: q });
  await settle(160);
};
const enter = async (): Promise<void> => {
  shell.dispatch({ type: 'ui:key', ref: 'search', key: 'Enter' });
  await settle();
};
const rows = (canvas: string): unknown[] => (dataOf(canvas)?.['rows'] ?? []) as unknown[];

const main = async (): Promise<void> => {
  await getVexRuntime();
  const checks: [string, boolean][] = [];

  // Create → form modal.
  await search('new');
  await enter();
  const create = actionOf('modal');
  checks.push([`create opens in the modal (got ${String(create)})`, typeof create === 'string' && create.endsWith('.form')]);
  shell.clear('modal');
  await settle();

  // Screen → quickview on the modal canvas (NOT a main navigation).
  await search('deals');
  await enter();
  const qv = actionOf('modal');
  checks.push([`screen opens as a quickview on the modal (got ${String(qv)})`, qv === 'crm.deals']);
  checks.push([`quickview loaded its rows (got ${rows('modal').length})`, rows('modal').length > 0]);

  // Open fullscreen → main shows the action, carrying the rows.
  shell.dispatch({ type: 'ui:click', ref: 'fullscreen' });
  await settle();
  checks.push([`fullscreen navigates main (got ${String(actionOf('main'))})`, actionOf('main') === 'crm.deals']);
  checks.push([`fullscreen carried the rows (got ${rows('main').length})`, rows('main').length > 0]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — creates open as a form, screens as a quickview, fullscreen carries data.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};

void main();
