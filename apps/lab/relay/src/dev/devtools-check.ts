// Devtools check — nova's own devtools, pure nova, toggled from Settings and
// rendered in the plain-DOM terminal. Proves: the Settings → Developer toggle
// mounts/unmounts the dock (via `devtools.setEnabled`); nova/reflect feeds it
// the live shell tree; the timeline records a real endpoint call from the
// shell's endpoint telemetry (`shell.onEndpoint`); it renders through nova/dom
// (Panel + JsonTree + Table, generic primitives) with real data; the toggle is
// a no-op for a non-dev (the dock isn't granted). nova reads itself in HTML.
import { JSDOM } from 'jsdom';
import { createDomView } from '@niscorp/nova/adapters/dom';
import { defaultRegistry, fallback } from '@niscorp/nova/adapters/dom/components';
import { DEVTOOLS_CANVAS } from '@niscorp/nova/devtools';
import { login, runtime } from './check-shell';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  KeyboardEvent: window.KeyboardEvent,
  Node: window.Node,
});

const checks: [string, boolean][] = [];
const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

const main = async (): Promise<void> => {
  // ── a dev principal: devtools starts OFF (empty canvas) ──
  const alex = login('alex'); // sales + dev → holds devtools.dock
  await tick();
  checks.push(['dev principal: the devtools canvas starts empty (no seed)', alex.getCanvasState(DEVTOOLS_CANVAS).active === undefined]);

  // ── open Settings, flip Developer → Developer tools ON → dock mounts ──
  alex.push('main', 'settings');
  await tick();
  alex.dispatch({ type: 'ui:model', ref: 'devtools-toggle', payload: true });
  await tick();
  checks.push(['the Settings toggle mounts the dock', alex.getCanvasState(DEVTOOLS_CANVAS).active?.definitionId === 'devtools.dock']);

  // render the devtools canvas in the plain-DOM terminal
  const root = window.document.getElementById('root')!;
  const view = createDomView(
    root,
    defaultRegistry(),
    { frame: () => alex.flattenRenderTree(alex.getCanvasRenderTree(DEVTOOLS_CANVAS)), canvasTree: () => [], dispatch: () => undefined, publish: () => undefined },
    { fallback },
  );
  const text = (): string => {
    view.render();
    return root.textContent ?? '';
  };
  // the dock auto-calls shellState/audit on mount; the per-session telemetry
  // tap publishes `devtools:state` once built, which the dock re-reads on.
  const t0 = Date.now();
  while (!text().includes('main') && Date.now() - t0 < 8000) await tick(50);
  checks.push(['the dock renders in the plain-DOM terminal (Panel title present)', text().includes('devtools')]);
  checks.push(['nova/reflect fed it the live shell tree (canvas "main" shown)', text().includes('main')]);
  checks.push(['the dock is generic primitives (real buttons render)', root.querySelector('button') !== null]);

  // dock runtime accessor — the drill-down checks read its data directly
  const dockData = (): Record<string, unknown> => {
    const id = alex.getCanvasState(DEVTOOLS_CANVAS).active?.id ?? '';
    return alex.getRuntime(id)?.getData() ?? {};
  };

  // ── the shell-model accordion: the shell's own row opens layouts + registry ──
  alex.dispatch({ type: 'ui:click', ref: 'shell-open', payload: 'shell' });
  await tick(100);
  checks.push(['the shell-model row opens in place (registry + layout store)', dockData()['shellOpen'] === 'shell' && text().includes('registry')]);

  // ── audit accordion: a row opens its findings in place; same click closes ──
  alex.dispatch({ type: 'ui:click', ref: 'tab-audit' });
  await tick(100);
  alex.dispatch({ type: 'ui:click', ref: 'audit-open', payload: 'chrome.topbar' });
  await tick(100);
  checks.push(['an audit row opens its findings in place', dockData()['auditOpen'] === 'chrome.topbar' && text().includes('address')]);
  alex.dispatch({ type: 'ui:click', ref: 'audit-open', payload: 'chrome.topbar' });
  await tick(100);
  checks.push(['clicking the open row again closes it (pure-data toggle)', dockData()['auditOpen'] === '']);

  // ── the timeline: a REAL endpoint call, recorded via telemetry, in the DOM ──
  // Pushing the deals list fires HTTP endpoint calls on mount (through the moss
  // wire → server.request → vex). Each flows to shell.onEndpoint → the devtools
  // tap records it → the timeline tab shows it. This is the full loop: nova
  // reads its own live traffic, rendered in plain HTML.
  alex.push('main', 'crm.deals');
  await tick(250); // let the async endpoint calls resolve + record
  alex.dispatch({ type: 'ui:click', ref: 'tab-timeline' }); // switch the dock → re-reads the timeline
  const t1 = Date.now();
  while (!text().includes('http') && Date.now() - t1 < 8000) await tick(50);
  checks.push(['the timeline records a real endpoint call (kind "http", from shell.onEndpoint)', text().includes('http')]);
  checks.push(['the timeline shows the deals load endpoint by name', text().includes('load')]);
  checks.push(['the timeline shows the CALLER (recorded definition id)', text().includes('crm.deals')]);

  // ── timeline accordion: a row opens its detail in place (NO tab jump) ──
  const rows = (dockData()['timeline'] as { rows: Array<{ seq: number; instanceId: string }> }).rows;
  const first = rows[0]!;
  alex.dispatch({ type: 'ui:click', ref: 'timeline-open', payload: first.seq });
  await tick(100);
  checks.push(['a timeline row opens its detail in place, staying on the timeline', dockData()['timelineOpen'] === first.seq && dockData()['tab'] === 'timeline']);

  // ── every ⚙ PUSHES an inspector — the devtools canvas is a real stack ──
  const dealsId = alex.getCanvasState('main').active?.id ?? '';
  const dtState = (): { stack: unknown[]; active?: { id: string; definitionId: string } } => {
    const s = alex.getCanvasState(DEVTOOLS_CANVAS);
    return { stack: s.stack, ...(s.active !== undefined ? { active: { id: s.active.id, definitionId: s.active.definitionId } } : {}) };
  };
  alex.dispatch({ type: 'ui:click', ref: 'inspect', payload: dealsId });
  await tick(100);
  checks.push(['⚙ pushes an inspector onto the devtools stack (over the dock)', dtState().stack.length === 2 && dtState().active?.definitionId === 'devtools.inspect']);
  const inspected = (alex.getRuntime(dtState().active?.id ?? '')?.getData()['instance'] ?? {}) as { id?: string };
  checks.push(['the inspector describes the pushed instance', inspected.id === 'crm.deals']);
  alex.dispatch({ type: 'ui:click', ref: 'inspect', payload: dealsId });
  await tick(100);
  checks.push(['inspecting from an inspector goes deeper (depth 3)', dtState().stack.length === 3]);
  // ← = back: pop ONE level
  alex.dispatch({ type: 'ui:click', ref: 'inspect-back' });
  await tick(50);
  checks.push(['← goes back one level (depth 3 → 2)', dtState().stack.length === 2 && dtState().active?.definitionId === 'devtools.inspect']);
  // ✕ = close: clear the WHOLE stack, back to a fresh dock
  alex.dispatch({ type: 'ui:click', ref: 'inspect-close' });
  await tick(100);
  checks.push(['✕ closes — the stack clears to a fresh dock', dtState().stack.length === 1 && dtState().active?.definitionId === 'devtools.dock']);

  // ── stack navigation from the dock: an open canvas offers ← pop ──
  alex.dispatch({ type: 'ui:click', ref: 'tab-shell' });
  await tick(100);
  alex.dispatch({ type: 'ui:click', ref: 'shell-open', payload: 'main' });
  await tick(100);
  checks.push(['an open canvas with depth > 1 offers ← pop', text().includes('← pop')]);
  alex.dispatch({ type: 'ui:click', ref: 'canvas-back', payload: 'main' });
  await tick(150);
  checks.push(['← pops that canvas’s top (deals → settings resumes)', alex.getCanvasState('main').active?.definitionId === 'settings']);

  // ── the ActionSlot seam: the flattened tree keeps the per-instance boundary ──
  const mainFlat = JSON.stringify(alex.flattenRenderTree(alex.getCanvasRenderTree('main')));
  const mainId = alex.getCanvasState('main').active?.id ?? '';
  checks.push(['the flattened tree keeps the ActionSlot marker with identity (the slotWrapper seam)', mainFlat.includes('ActionSlot') && mainFlat.includes(`"instanceId":"${mainId}"`)]);

  // ── ✕ collapses to the ⚙ pill (stays mounted); the pill expands back ──
  alex.dispatch({ type: 'ui:click', ref: 'dock-close' });
  await tick();
  checks.push(['✕ collapses the dock to the pill (still mounted)', alex.getCanvasState(DEVTOOLS_CANVAS).active?.definitionId === 'devtools.dock' && text().includes('⚙ devtools')]);
  alex.dispatch({ type: 'ui:click', ref: 'dock-expand' });
  await tick();
  checks.push(['the pill expands the dock again', text().includes('the live shell')]);

  // ── flip the toggle OFF → dock unmounts (Settings is active — ← popped deals) ──
  alex.dispatch({ type: 'ui:model', ref: 'devtools-toggle', payload: false });
  await tick();
  checks.push(['flipping the toggle off unmounts the dock', alex.getCanvasState(DEVTOOLS_CANVAS).active === undefined]);

  // ── everyone SEES the toggle, but it no-ops for a non-dev (dock not granted) ──
  const jordan = login('jordan'); // viewer → holds settings, NOT devtools.dock
  jordan.push('main', 'settings');
  await tick();
  jordan.dispatch({ type: 'ui:model', ref: 'devtools-toggle', payload: true });
  await tick();
  checks.push(['non-dev: the toggle is a no-op — the dock is not granted', jordan.getCanvasState(DEVTOOLS_CANVAS).active === undefined]);

  await runtime.db.close();

  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  }
  if (failed > 0) {
    console.log(`\nFAIL — ${failed} check(s).`);
    process.exit(1);
  }
  console.log('\nOK — nova reads itself: the devtools dock is pure nova, served by grant, rendered in plain DOM.');
  process.exit(0);
};

void main();
