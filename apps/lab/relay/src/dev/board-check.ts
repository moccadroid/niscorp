// Pipeline Kanban (Tier 2). Drives the board headlessly: it loads its columns +
// cards, a card click opens the deal detail, and a card "drop" fires the new
// `ui:drop` event into the `moveDeal` seam (honest no-op — board reloads
// unchanged). No grouping code: the layout groups cards into columns by stage.
import { shell } from './check-shell';
import { getVexRuntime } from '../vex/runtime';

const settle = (ms = 200): Promise<void> => new Promise((r) => setTimeout(r, ms));
const mainOf = (): { id: string } | undefined => shell.getCanvasState('main').active;
const mainData = (): Record<string, unknown> | undefined => {
  const a = mainOf();
  return a !== undefined ? shell.getRuntime(a.id)?.getData() : undefined;
};
const mainAction = (): string | undefined => {
  const a = mainOf();
  return a !== undefined ? shell.getRuntime(a.id)?.definition.id : undefined;
};
const board = (): { stages?: unknown[]; deals?: unknown[]; summary?: Record<string, unknown> } =>
  (mainData() ?? {}) as { stages?: unknown[]; deals?: unknown[]; summary?: Record<string, unknown> };
const modalRt = (): ReturnType<typeof shell.getRuntime> => {
  const a = shell.getCanvasState('modal').active;
  return a !== undefined ? shell.getRuntime(a.id) : undefined;
};

const main = async (): Promise<void> => {
  await getVexRuntime();
  const checks: [string, boolean][] = [];

  // Navigate to the pipeline board (sidebar nav).
  shell.dispatch({ type: 'ui:click', ref: 'nav-pipeline' });
  await settle(320);
  // The board is now the `deals` action in board view (one action, two layouts).
  checks.push([`pipeline board mounted (got ${String(mainAction())} view=${String(mainData()?.['view'])})`, mainAction() === 'crm.deals' && mainData()?.['view'] === 'board']);
  const stages = board().stages ?? [];
  const deals = board().deals ?? [];
  checks.push([`columns loaded (got ${stages.length})`, stages.length > 0]);
  checks.push([`cards loaded (got ${deals.length})`, deals.length === 82]);
  const colTotal = (stages as Record<string, unknown>[]).reduce((n, s) => n + Number(s['count']), 0);
  checks.push([`column counts sum to the card count (${colTotal} = ${deals.length})`, colTotal === deals.length]);

  // Forecast bar: total + weighted assembled in loadBoard.
  const summary = board().summary ?? {};
  checks.push([`forecast: total=${String(summary['total'])} weighted=${String(summary['weighted'])}`, typeof summary['total'] === 'string' && String(summary['total']).startsWith('$') && String(summary['weighted']).startsWith('$')]);

  // A card click DRILLS into the deal workspace on `main` (pushed over the board),
  // loading the rich view (record + activities + line items + tasks + contact).
  const firstDeal = (deals[0] as Record<string, unknown> | undefined)?.['deal_id'];
  shell.dispatch({ type: 'ui:click', ref: 'card', payload: firstDeal });
  await settle(260);
  const active = shell.getCanvasState('main').active;
  const mr = active !== undefined ? shell.getRuntime(active.id) : undefined;
  const view = (mr?.getData() ?? {}) as Record<string, unknown>;
  const rec = (view['record'] ?? {}) as Record<string, unknown>;
  checks.push([`card drills into the deal workspace (got ${String(mr?.definition.id)})`, mr?.definition.id === 'crm.deal.view']);
  checks.push([`deal loaded (${String(rec['title'])}, prob ${String(rec['prob'])})`, rec['deal_id'] === firstDeal && rec['prob'] !== undefined]);
  checks.push([`workspace has the activity feed (got ${(view['activities'] as unknown[] | undefined)?.length ?? 0})`, Array.isArray(view['activities']) && (view['activities'] as unknown[]).length > 0]);
  // The chip's Back pops the deal off main and returns to the board.
  shell.pop('main');
  await settle(80);
  checks.push([`Back returns to the board (got ${String(mainAction())})`, mainAction() === 'crm.deals']);

  // A drop fires ui:drop → `deal.moveStage` persists, the board reloads, and the
  // card lands in the target column (the DropZone carries the real stage_id).
  const card0 = deals[0] as Record<string, unknown>;
  const fromStage = card0['stage'];
  const targetCol = (stages as Record<string, unknown>[]).find((s) => s['stage_id'] !== card0['stage_id']);
  shell.dispatch({ type: 'ui:drop', ref: 'move-deal', payload: { id: card0['deal_id'], toStage: targetCol?.['stage_id'] } });
  await settle(350);
  const moved = (board().deals ?? []).find((d) => (d as Record<string, unknown>)['deal_id'] === card0['deal_id']) as Record<string, unknown> | undefined;
  checks.push([`ui:drop MOVED the card (${String(fromStage)} → ${String(moved?.['stage'])})`, moved?.['stage'] === targetCol?.['stage']]);
  checks.push([`board still holds all open cards (got ${(board().deals ?? []).length})`, (board().deals ?? []).length === 82]);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — Kanban groups in-layout, cards open, ui:drop persists the stage move.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
