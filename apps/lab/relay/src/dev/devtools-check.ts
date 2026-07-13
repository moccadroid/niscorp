// nova-devtools (headless). The devtools is now built OF nova — the dock and
// inspector are actions on a `devtools` canvas — so this check drives the real
// thing end-to-end in node: flag on → dock pushed; interactions → taps →
// `devtools:entry` notification → dock trigger `call: pull` → rows in action
// data; chip-equivalent push → inspector describes an instance; flag off →
// canvas cleared, recording stops. Plus the audit classifier on a synthetic
// definition with known noise + known breaks.
// Run: pnpm --filter relay exec tsx src/dev/devtools-check.ts
import { auditAction } from '@niscorp/nova';
import type { ActionDefinition, PublicActionRuntime, RenderNode } from '@niscorp/nova';
import { shell } from '../nova/shell';
import { getVexRuntime } from '../vex/runtime';
import { classifyIssue } from '../nova-devtools/core/audit-classify';
import { setDevtoolsEnabled } from '../nova-devtools/core/flag';
import { devtoolsLog } from '../nova-devtools/core/log';

const settle = (ms = 350): Promise<void> => new Promise((r) => setTimeout(r, ms));

const dockRuntime = (): PublicActionRuntime | undefined => {
  const active = shell.getCanvasState('devtools').active;
  return active !== undefined ? shell.getRuntime(active.id) : undefined;
};
const dockData = (): Record<string, unknown> => dockRuntime()?.getData() ?? {};

const countErrors = (nodes: RenderNode[]): number => {
  let errors = 0;
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n === null || typeof n !== 'object') return;
    const node = n as { type?: string; children?: unknown };
    if (node.type === 'error') errors += 1;
    if (node.children !== undefined) walk(node.children);
  };
  walk(nodes);
  return errors;
};

const main = async (): Promise<void> => {
  await getVexRuntime(); // engine up + seeded before we drive navigation
  const checks: [string, boolean][] = [];

  // The devtools primitives are React components; register node stubs so the
  // dock/inspector layouts materialize headlessly.
  shell.registry.registerAll({
    JsonTree: Object.assign(() => null, { meta: { description: 'stub' } }),
    DevtoolsPanel: Object.assign(() => null, { meta: { description: 'stub' } }),
  });

  // ── Flag off: the app runs, the devtools does not exist.
  shell.dispatch({ type: 'ui:click', ref: 'nav-deals' });
  await settle();
  const mainActive = shell.getCanvasState('main').active;
  const rows = (mainActive !== undefined ? shell.getRuntime(mainActive.id)?.getData()['rows'] : undefined) as unknown[] | undefined;
  checks.push([`off-flag: deals screen loaded through the traced fetch (${rows?.length ?? 0} rows)`, Array.isArray(rows) && rows.length > 0]);
  checks.push([`off-flag: trace buffer stayed empty (${devtoolsLog.entries().length})`, devtoolsLog.entries().length === 0]);
  checks.push(['off-flag: devtools canvas is empty', shell.getCanvasState('devtools').stack.length === 0]);

  // ── Flag on: the dock action is pushed and hydrates itself via fn endpoints.
  setDevtoolsEnabled(true);
  await settle();
  checks.push(['on-flag: dock action pushed onto the devtools canvas', shell.getCanvasState('devtools').active?.definitionId === 'devtools.dock']);
  const shellTab = dockData()['shell'] as { canvases?: unknown[] } | undefined;
  const auditTab = dockData()['audit'] as { rows?: unknown[]; address?: number; explained?: number } | undefined;
  checks.push([`dock: shell tab hydrated (${shellTab?.canvases?.length ?? 0} canvases)`, (shellTab?.canvases?.length ?? 0) > 0]);
  checks.push([
    `dock: audit hydrated (${auditTab?.address ?? '?'} to address, ${auditTab?.explained ?? '?'} explained)`,
    (auditTab?.rows?.length ?? 0) > 0 && typeof auditTab?.address === 'number',
  ]);

  // ── Interact: taps → notification → pull → rows land in the dock's data.
  shell.dispatch({ type: 'ui:click', ref: 'nav-companies' });
  await settle(500);
  const view = dockData()['view'] as { rows?: { badge?: string; time?: string; label?: string }[]; total?: number };
  checks.push([`dock: timeline pulled (${view.total ?? 0} entries)`, (view.total ?? 0) > 0 && (view.rows?.length ?? 0) > 0]);
  const badges = new Set((view.rows ?? []).map((r) => r.badge));
  checks.push([`dock: rows carry formatted time/badge/label (${[...badges].join(', ')})`, (view.rows ?? []).every((r) => r.time !== undefined && r.label !== undefined)]);
  const kinds = new Set(devtoolsLog.entries().map((e) => e.kind));
  checks.push(['taps: state + data + fetch all captured', kinds.has('state') && kinds.has('data') && kinds.has('fetch')]);

  // ── The dock's own layout materializes without error nodes (dogfood: the
  // devtools UI is itself a nova render tree).
  checks.push(['dock: layout renders with zero error nodes', countErrors(shell.getCanvasRenderTree('devtools')) === 0]);

  // ── Pause pins the view.
  shell.dispatch({ type: 'ui:click', ref: 'pause' });
  await settle();
  const pinned = (dockData()['view'] as { rows?: unknown[] }).rows?.length ?? -1;
  shell.dispatch({ type: 'ui:click', ref: 'nav-deals' });
  await settle(500);
  checks.push(['dock: paused view stays pinned while entries accumulate', ((dockData()['view'] as { rows?: unknown[] }).rows?.length ?? -2) === pinned]);
  checks.push(['dock: behind-counter moves', ((dockData()['view'] as { behind?: number }).behind ?? 0) > 0]);
  shell.dispatch({ type: 'ui:click', ref: 'pause' });
  await settle();

  // ── The inspector: same push a chip click performs — composed with the
  // shared devtools.frame fragment (panel chrome + title + ✕).
  const inspectTarget = shell.getCanvasState('main').active;
  shell.push('devtools', 'devtools.inspect', { instanceId: inspectTarget?.id ?? '' }, ['devtools.frame']);
  await settle();
  const inspector = dockRuntime();
  const target = (inspector?.getData()['target'] ?? {}) as { found?: boolean; id?: string; endpoints?: unknown[]; layout?: unknown };
  checks.push([`inspector: described ${String(target.id)} (found=${String(target.found)})`, target.found === true && target.id === inspectTarget?.definitionId]);
  checks.push([
    'inspector: devtools.frame composed (frameTitle set, ✕ trigger merged)',
    inspector?.getData()['frameTitle'] === `⚙ ${inspectTarget?.definitionId}` &&
      (inspector?.definition.triggers ?? []).some((t) => t.ref === 'devtools-close'),
  ]);
  checks.push(['inspector: endpoints summarized + layout resolved', (target.endpoints?.length ?? 0) > 0 && target.layout !== null]);
  checks.push(['inspector: renders with zero error nodes', countErrors(shell.getCanvasRenderTree('devtools')) === 0]);
  // Guard against the bare-binding foot-gun ('$' as a literal prop resolves to
  // the ROOT data object): every resolved JsonTree label must be a string.
  const badLabels: unknown[] = [];
  const walkLabels = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walkLabels);
    if (n === null || typeof n !== 'object') return;
    const node = n as { name?: string; props?: { label?: unknown }; children?: unknown };
    if (node.name === 'JsonTree' && node.props?.label !== undefined && typeof node.props.label !== 'string') badLabels.push(node.props.label);
    if (node.children !== undefined) walkLabels(node.children);
  };
  walkLabels(shell.flattenRenderTree(shell.getCanvasRenderTree('devtools')));
  checks.push(['inspector: no prop resolved to a non-string label (bare-binding guard)', badLabels.length === 0]);
  shell.pop('devtools');
  await settle();
  checks.push(['inspector: pop resumes the dock', shell.getCanvasState('devtools').active?.definitionId === 'devtools.dock']);

  // ── Audit classification on a synthetic definition — one of each known
  // noise class plus two genuinely-broken wires.
  const synthetic: ActionDefinition = {
    id: 'synthetic',
    data: { rows: [] },
    layout: {
      component: 'Stack',
      children: [
        { for: '$.rows', as: 'row', do: { component: 'Text', props: { value: '$.row.name' } } },
        { component: 'Table', props: { rowRef: 'row-open', columns: [{ cell: { ref: 'toggle' } }] } },
        { component: 'Button', ref: 'ghost', props: { label: 'dead' } },
      ],
    },
    triggers: [
      { event: 'ui:click', ref: 'row-open', do: [{ set: 'missing', value: 1 }] },
      { event: 'ui:click', ref: 'toggle', do: [{ push: { action: '{{$.chosen}}' } }] },
    ],
  };
  const classified = auditAction(synthetic, { catalog: [{ id: 'synthetic' }] }).issues.map((issue) => ({
    issue,
    cls: classifyIssue(issue, synthetic),
  }));
  const expectInfo = (needle: string): boolean => classified.some((c) => c.issue.includes(needle) && c.cls.kind === 'info');
  const expectAddress = (needle: string): boolean => classified.some((c) => c.issue.includes(needle) && c.cls.kind === 'address');
  checks.push(['classify: loop `as:` bind is explained', expectInfo('"$.row"')]);
  checks.push(['classify: *Ref props already resolved by the audit', classified.every((c) => !c.issue.includes('row-open'))]);
  checks.push(['classify: nested prop ref (cell.ref) is explained', expectInfo('"toggle"')]);
  checks.push(['classify: template nav target is explained', expectInfo('{{$.chosen}}')]);
  checks.push(['classify: dead chrome ref stays red', expectAddress('"ghost"')]);
  checks.push(['classify: mutation to undeclared key stays red', expectAddress('set: missing')]);

  // ── Flag off: canvas cleared, recording stops, the app keeps working.
  setDevtoolsEnabled(false);
  await settle();
  const frozen = devtoolsLog.entries().length;
  shell.dispatch({ type: 'ui:click', ref: 'nav-contacts' });
  await settle();
  checks.push(['off again: devtools canvas cleared', shell.getCanvasState('devtools').stack.length === 0]);
  checks.push(['off again: trace buffer frozen', devtoolsLog.entries().length === frozen]);
  checks.push(['off again: navigation still works', shell.getCanvasState('main').active?.definitionId === 'contacts']);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — the devtools is itself nova: dock + inspector are actions, driven headlessly.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
