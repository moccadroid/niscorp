// nova-devtools (headless). The devtools is built OF nova — dock and
// inspector are actions on a `devtools` canvas. With the shell in moss, the
// devtools' HYDRATION path (fn endpoints: pull/describe) is PARKED until
// server functions exist (SERVER.md step 4) — those fns lived in the
// deleted client shell. What still holds and is checked here: install +
// flag lifecycle (on → dock pushed; off → cleared, recording frozen), the
// dock layout materializing without error nodes, and the audit classifier
// on a synthetic definition with known noise + known breaks.
// Run: pnpm --filter relay exec tsx src/dev/devtools-check.ts
import { auditAction } from '@niscorp/nova';
import type { ActionDefinition, PublicActionRuntime, RenderNode } from '@niscorp/nova';
import { shell, runtime } from './check-shell';
import { installNovaDevtools } from '@relay/dev/devtools/core/install';
import { classifyIssue } from '@relay/dev/devtools/core/audit-classify';
import { setDevtoolsEnabled } from '@relay/dev/devtools/core/flag';
import { devtoolsLog } from '@relay/dev/devtools/core/log';

// The devtools install lived in the deleted client buildShell (dev role
// auto-install); the check installs explicitly onto the server shell —
// devtools-in-the-terminal is a later story.
installNovaDevtools(shell);

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
  checks.push([`off-flag: deals screen loads with devtools dark (${rows?.length ?? 0} rows)`, Array.isArray(rows) && rows.length > 0]);
  checks.push([`off-flag: trace buffer stayed empty (${devtoolsLog.entries().length})`, devtoolsLog.entries().length === 0]);
  checks.push(['off-flag: devtools canvas is empty', shell.getCanvasState('devtools').stack.length === 0]);

  // ── Flag on: the dock action is pushed and hydrates itself via fn endpoints.
  setDevtoolsEnabled(true);
  await settle();
  checks.push(['on-flag: dock action pushed onto the devtools canvas', shell.getCanvasState('devtools').active?.definitionId === 'devtools.dock']);
  checks.push(['dock: layout renders with zero error nodes', countErrors(shell.getCanvasRenderTree('devtools')) === 0]);
  // (dock hydration, timeline, taps and the inspector describe flow ride fn
  // endpoints — parked until moss serves functions, SERVER.md step 4)

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
  checks.push(['off again: navigation still works', shell.getCanvasState('main').active?.definitionId === 'crm.contacts']);

  let ok = true;
  for (const [label, pass] of checks) {
    ok = ok && pass;
    console.log(`${pass ? '✓' : '✗'} ${label}`);
  }
  console.log(ok ? '\nOK — the devtools is itself nova: dock + inspector are actions, driven headlessly.' : '\nFAIL.');
  process.exit(ok ? 0 : 1);
};
void main();
