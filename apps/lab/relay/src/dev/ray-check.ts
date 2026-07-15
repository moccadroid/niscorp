// Ray's surface, headless (no LLM). Proves the agent's tools really drive the
// shell and the context really reflects it — the same calls the Cortex agent
// makes, invoked directly. Run: pnpm --filter relay exec tsx src/dev/ray-check.ts
import { shell } from './check-shell';
import { getVexRuntime } from '../vex/runtime';
import { makeTools } from '../ray/tools';
import { buildContext } from '../ray/context';
import type { ToolContext } from '@niscorp/cortex';

const settle = (ms = 260): Promise<void> => new Promise((r) => setTimeout(r, ms));
const activeId = (canvas: string): string | undefined => {
  const a = shell.getCanvasState(canvas).active;
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};
const activeData = (canvas: string): Record<string, unknown> => {
  const a = shell.getCanvasState(canvas).active;
  return (a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined) ?? {};
};

const main = async (): Promise<void> => {
  await getVexRuntime();
  const checks: [string, boolean][] = [];
  // A real v2 ToolContext — no bus, no casts.
  const ctx: ToolContext = {
    runId: 'check',
    agentId: 'ray',
    agentPath: ['ray'],
    signal: new AbortController().signal,
    forward: () => undefined,
  };
  const [stackTool, queryTool] = makeTools(shell, {});
  if (stackTool === undefined || queryTool === undefined) {
    console.error('makeTools returned fewer tools than expected');
    process.exit(1);
  }

  // Context reflects the real screen + lists the catalog.
  const c0 = buildContext(shell);
  checks.push(['context has SCREEN + ACTIONS + catalog ids', c0.includes('SCREEN') && c0.includes('ACTIONS') && c0.includes('deals') && c0.includes('deal.form')]);

  // stack push(deals, main, {view:board}) → the merged deals action in board view.
  const r1 = await stackTool.config.execute({ canvas: 'main', op: 'push', action: 'crm.deals', input: { view: 'board' } }, ctx);
  await settle(320);
  checks.push([`push deals board on main (got ${String(activeId('main'))} view=${String(activeData('main')['view'])})`, activeId('main') === 'crm.deals' && activeData('main')['view'] === 'board']);
  checks.push([`push returned a confirmation (got ${String(r1)})`, typeof r1 === 'string' && r1.includes('deals')]);

  // find_records(company) → resolve a name to {id,label}.
  const found = (await queryTool.config.execute({ entity: 'company', match: 'a' }, ctx)) as { id: unknown; label: unknown }[];
  const first = found[0];
  checks.push([`find_records company returns {id,label} (got ${found.length})`, Array.isArray(found) && first !== undefined && typeof first.id === 'string' && typeof first.label === 'string']);

  // push that company onto the rail.
  await stackTool.config.execute({ canvas: 'aside', op: 'push', action: 'crm.company.view', input: { id: first?.id } }, ctx);
  await settle(320);
  checks.push([`push company in aside (got ${String(activeId('aside'))})`, activeId('aside') === 'crm.company.view' && activeData('aside')['id'] === first?.id]);

  // pop the rail back to empty.
  await stackTool.config.execute({ canvas: 'aside', op: 'clear' }, ctx);
  await settle(80);
  checks.push([`clear empties the aside (got ${String(activeId('aside'))})`, activeId('aside') === undefined]);

  // Context now reflects the new screen state.
  const c1 = buildContext(shell);
  checks.push(['context reflects board + opened company', c1.includes('view') && c1.includes('company')]);

  // push a form onto the modal canvas (prefilled — human would commit).
  await stackTool.config.execute({ canvas: 'modal', op: 'push', action: 'crm.deal.form', input: { title: 'Ray Test Deal' } }, ctx);
  await settle(220);
  checks.push([`push deal.form on modal (got ${String(activeId('modal'))})`, activeId('modal') === 'crm.deal.form' && activeData('modal')['title'] === 'Ray Test Deal']);

  // push(companies, main, {sortBy}) → list opens pre-sorted.
  await stackTool.config.execute({ canvas: 'main', op: 'push', action: 'crm.companies', input: { sortBy: 'companies.size', sortDir: 'asc' } }, ctx);
  await settle(320);
  checks.push([`push companies sorted by size (got sortBy=${String(activeData('main')['sortBy'])})`, activeId('main') === 'crm.companies' && activeData('main')['sortBy'] === 'companies.size']);

  // pop main → back to the deals board pushed earlier.
  await stackTool.config.execute({ canvas: 'main', op: 'pop' }, ctx);
  await settle(220);
  checks.push([`pop main returns to deals (got ${String(activeId('main'))})`, activeId('main') === 'crm.deals']);

  // Unknown action is handled gracefully (no throw, helpful message).
  const r5 = await stackTool.config.execute({ canvas: 'main', op: 'push', action: 'nope' }, ctx);
  checks.push([`unknown action returns a message (got ${String(r5)})`, typeof r5 === 'string' && r5.includes('Unknown')]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — Ray drives the shell and the context tracks it (no LLM).' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
