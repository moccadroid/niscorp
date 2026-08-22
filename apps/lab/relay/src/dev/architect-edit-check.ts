// The REFINEMENT loop, held to oracles. Build the byMonth screen, then ask
// for ONE small change — "add September" — and verify like a skeptic:
//   1. the change LANDED (a September option with the right literals —
//      2026-09-01..2026-09-30; 30 days is itself a calendar trap),
//   2. the September query is REAL (replay the artifact's fingerprint with
//      those literals; count must equal SQL truth),
//   3. nothing else DRIFTED (canonical-JSON diff per top-level section —
//      an edit that rebuilds the world to add an option is a failure even
//      when the option works),
//   4. the edited screen still RENDERS its rows live.
import { shell, runtime } from './check-shell';
import { architectLlms, runActionArchitect } from '@relay/server/functions/ray/architect';
import { rayEngine, type RayContext } from '@relay/server/functions/ray/engine';
import { createScopePolicy, scopeGrants } from '@niscorp/vex';
import { resolvePrincipal } from '@niscorp/charter';
import { CHARTER } from '@relay/app/charter';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { TABLES } from '@relay/db/schema';

const BUILD_INTENT =
  'A screen listing all deals whose close date falls in a selected month. A dropdown offers June, July and ' +
  'August; picking one reloads the table. Columns: deal title, company name, stage, value, close date. ' +
  'Clicking a row opens that deal (crm.deal.view).';
const EDIT_INTENT =
  'Add September to the month dropdown (deals closing in September 2026). Everything else stays exactly as it is.';

const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = canonical((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
};
const section = (a: unknown, key: string): string => JSON.stringify(canonical((a as Record<string, unknown>)[key] ?? null));

type AnyNode = { type?: string; name?: string; props?: Record<string, unknown>; children?: AnyNode[] };
const tableRows = (nodes: AnyNode[]): number => {
  for (const n of nodes) {
    if (n.type === 'component' && n.name === 'Table') { const r = n.props?.['rows']; return Array.isArray(r) ? r.length : 0; }
    if (n.children) { const inner = tableRows(n.children); if (inner >= 0) return inner; }
  }
  return -1;
};

const mountRows = async (action: { id: string }): Promise<number> => {
  shell.registerAction(action as never);
  const iid = shell.push('main', action.id);
  const rt = shell.getRuntime(iid);
  if (rt === undefined) return -1;
  await new Promise<void>((res) => {
    if (rt.instance.status === 'active') return res();
    const off = rt.onStatusChange((st: string) => { if (st === 'active' || st === 'unmounted') { off(); res(); } });
    setTimeout(res, 20000);
  });
  await new Promise((r) => setTimeout(r, 1500));
  const n = tableRows(shell.flattenRenderTree(shell.getCanvasRenderTree('main')) as AnyNode[]);
  shell.removeAction(action.id);
  return n;
};

const main = async (): Promise<void> => {
  const llms = architectLlms();
  if ('error' in llms) { console.error(llms.error); process.exit(2); }
  const policy = createScopePolicy(resolvePrincipal(CHARTER, scopeGrants(TABLES), ['sales', 'dev'], 'data'), scopeBehaviors);
  const ray: RayContext = { shell, userId: 'usr_001', policy, engine: () => rayEngine(runtime, policy) };

  console.log('── build ──');
  const t0 = Date.now();
  const built = await runActionArchitect(ray, llms.agent, llms.support, BUILD_INTENT, {});
  if (!built.ok) { console.error('build failed:', built.error); process.exit(1); }
  const baseRows = await mountRows(built.action);
  console.log(`built in ${Math.round((Date.now() - t0) / 1000)}s — live renders ${baseRows} rows`);

  console.log('── edit: add September ──');
  const t1 = Date.now();
  const edited = await runActionArchitect(ray, llms.agent, llms.support, EDIT_INTENT, { base: built.action });
  if (!edited.ok) { console.error('edit failed:', edited.error, edited.issues ?? ''); process.exit(1); }
  console.log(`edited in ${Math.round((Date.now() - t1) / 1000)}s`);

  // 1 — the change landed, with the right literals
  const editedJson = JSON.stringify(edited.action);
  const hasSeptember = editedJson.includes('September');
  const sepStart = editedJson.includes('2026-09-01');
  const sepEndOk = editedJson.includes('2026-09-30');
  const sepEndBad = editedJson.includes('2026-09-31');
  console.log(`1. change landed   : September=${hasSeptember} start-ok=${sepStart} end-ok=${sepEndOk}${sepEndBad ? '  END 2026-09-31 DOES NOT EXIST' : ''}`);

  // 2 — the September query is real: replay the artifact's fingerprint
  const fp = /"(fp_[0-9a-f]{16})"/.exec(editedJson)?.[1];
  let sepVerdict = 'no fp found';
  if (fp !== undefined) {
    const { engine } = await rayEngine(runtime, policy);
    try {
      const res = await engine.execute(
        { fingerprint: fp, context: { start: '2026-09-01', end: '2026-09-30' } },
        { scope: { userId: 'usr_001' } },
      );
      const got = Array.isArray(res.result) ? res.result.length : -1;
      const truth = ((await runtime.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM deals WHERE close_date BETWEEN '2026-09-01' AND '2026-09-30'`,
      )).rows[0]?.n ?? -2);
      sepVerdict = got === truth ? `PASS replays ${got} = SQL truth` : `FAIL replays ${got}, SQL says ${truth}`;
    } catch (e) { sepVerdict = `replay threw: ${e instanceof Error ? e.message.slice(0, 80) : ''}`; }
  }
  console.log('2. September query :', sepVerdict);

  // 3 — drift per section
  const drifted: string[] = [];
  for (const key of ['data', 'endpoints', 'triggers', 'lifecycle', 'layout']) {
    if (section(built.action, key) !== section(edited.action, key)) drifted.push(key);
  }
  console.log('3. sections changed:', drifted.join(', ') || '(none)');

  // 4 — still renders
  const editedRows = await mountRows(edited.action);
  console.log(`4. edited renders  : ${editedRows} rows (was ${baseRows})`);

  const ok = hasSeptember && sepStart && sepEndOk && !sepEndBad && sepVerdict.startsWith('PASS')
    && editedRows === baseRows && !drifted.includes('endpoints') && !drifted.includes('triggers');
  console.log(ok ? '\nEDIT LOOP: PASS' : '\nEDIT LOOP: DEFECTS — read above');
  process.exit(ok ? 0 : 1);
};

void main();
