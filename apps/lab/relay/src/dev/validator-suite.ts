// The REVIEWER under the same microscope as the builder. It is a pure
// judge — { intent, action, report } in, verdict out — so it can be scored
// like an exam:
//
//   GOOD screens (today's verified artifacts) → zero blockers expected.
//     Every blocker raised on a good screen is a FALSE ALARM, and a false
//     alarm is not free: the pipeline burns its one repair round on it.
//   SABOTAGED screens → a blocker expected, every time. Each sabotage is a
//     defect the harness CANNOT catch — only a reader can:
//       wrongPush   row click opens a different (valid) screen than asked
//       dropColumn  a column the intent names is silently gone
//       lyingLabel  a column's header names one field, the cell shows another
//     Every miss is the reviewer asleep on the job.
//
//   pnpm --filter relay exec tsx src/dev/validator-suite.ts
//
// Fixtures come from the newest architect-suite artifacts on disk, paired
// with their intents. Reports are REAL harness runs of each (mutated)
// definition — mutations are chosen to stay harness-clean, so the reviewer
// faces exactly what it faces in production: a screen that mounts fine.
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { shell, runtime } from './check-shell';
import { INTENTS } from './architect-suite';
import { architectLlms, queryIntentsOf, runActionArchitect, validatorAgent } from '@relay/server/functions/ray/architect';
import { runAction } from '@relay/server/functions/ray/architect/harness';
import { llmFor } from '@relay/server/llm';
import { rayEngine, type RayContext } from '@relay/server/functions/ray/engine';
import { createScopePolicy, scopeGrants } from '@niscorp/vex';
import { resolvePrincipal } from '@niscorp/charter';
import { CHARTER } from '@relay/app/charter';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { TABLES } from '@relay/db/schema';

const SUITE_DIR =
  'C:/Users/manxx/AppData/Local/Temp/claude/C--Users-manxx-Development-niscorp/2dcaa551-d6ad-4235-a03c-dfd279d85e40/scratchpad/architect-suite';

type Action = Record<string, unknown>;

// Fixtures are built IN THIS PROCESS: an artifact from an earlier run points
// at fingerprints that died with that run's in-memory database, so its mounts
// fail here and the reviewer — correctly — blocks a screen that loads
// nothing. (The first version of this suite fed it exactly those corpses and
// scored the smell test as 8 false alarms.) Building fresh costs a few
// architect runs and makes every mount real.
const FIXTURE_IDS = ['top10', 'wonlost', 'feed'] as const;

// ── sabotage, as JSON surgery. Each returns null when its anchor is absent.
const clone = (a: Action): Action => JSON.parse(JSON.stringify(a)) as Action;

const wrongPush = (a: Action): Action | null => {
  const s = JSON.stringify(a);
  if (!s.includes('"push"')) return null;
  // Point the row click at a different, still-valid catalog screen.
  const swapped = s
    .replace(/"action":\s*"crm\.deal\.view"/, '"action": "crm.companies"')
    .replace(/"action":\s*"crm\.company\.view"/, '"action": "crm.deals"');
  if (swapped === s) return null;
  const out = JSON.parse(swapped) as Action;
  // A different target may take different input keys — drop the seeded input
  // so the sabotage stays harness-clean (audit checks input contracts).
  const drop = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(drop); return; }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (record['push'] !== undefined && typeof record['push'] === 'object') delete (record['push'] as Record<string, unknown>)['input'];
    Object.values(record).forEach(drop);
  };
  drop(out);
  return out;
};

const findTables = (node: unknown, hit: (t: Record<string, unknown>) => void): void => {
  if (Array.isArray(node)) { node.forEach((n) => findTables(n, hit)); return; }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record['component'] === 'Table' && record['props'] !== null && typeof record['props'] === 'object') hit(record['props'] as Record<string, unknown>);
  Object.values(record).forEach((v) => findTables(v, hit));
};

const dropColumn = (a: Action): Action | null => {
  const out = clone(a);
  let done = false;
  findTables(out['layout'], (props) => {
    const cols = props['columns'];
    if (!done && Array.isArray(cols) && cols.length >= 3) { cols.splice(1, 1); done = true; }
  });
  return done ? out : null;
};

const lyingLabel = (a: Action): Action | null => {
  const out = clone(a);
  let done = false;
  findTables(out['layout'], (props) => {
    const cols = props['columns'] as { label?: string; cell?: { key?: string } }[] | undefined;
    if (!done && Array.isArray(cols) && cols.length >= 2 && cols[0]?.cell?.key !== undefined && cols[1]?.cell?.key !== undefined) {
      // Column 0 keeps its label but shows column 1's field.
      cols[0].cell.key = cols[1].cell.key ?? '';
      done = true;
    }
  });
  return done ? out : null;
};

const MUTATIONS: Record<string, (a: Action) => Action | null> = { wrongPush, dropColumn, lyingLabel };

const main = async (): Promise<void> => {
  const llm = llmFor('validator');
  if ('error' in llm) { console.error(llm.error); process.exit(2); }
  const policy = createScopePolicy(resolvePrincipal(CHARTER, scopeGrants(TABLES), ['sales', 'dev'], 'data'), scopeBehaviors);
  const ray: RayContext = { shell, userId: 'usr_001', policy, engine: () => rayEngine(runtime, policy) };

  const outDir = join(SUITE_DIR, '..', 'validator-suite', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(outDir, { recursive: true });
  const put = (o: Record<string, unknown>): void => appendFileSync(join(outDir, 'cases.jsonl'), JSON.stringify(o) + '\n');

  const llms = architectLlms();
  if ('error' in llms) { console.error(llms.error); process.exit(2); }
  const built: { id: string; intent: string; action: Action }[] = [];
  for (const id of FIXTURE_IDS) {
    const intent = INTENTS[id] ?? '';
    process.stdout.write(`building fixture ${id}… `);
    const res = await runActionArchitect(ray, llms.agent, llms.support, intent, {});
    if (!res.ok) { console.log('FAILED — skipped'); continue; }
    console.log('ok');
    built.push({ id, intent, action: res.action as unknown as Action });
  }

  let falseAlarms = 0, goodCases = 0, caught = 0, sabotages = 0;
  for (const fx of built) {
    const cases: [string, Action | null][] = [['good', fx.action], ...Object.entries(MUTATIONS).map(([k, m]): [string, Action | null] => [k, m(fx.action)])];
    for (const [label, action] of cases) {
      if (action === null) continue;
      // The REAL report for THIS variant — the reviewer sees what prod shows it.
      const report = await runAction(ray, action);
      if (label !== 'good' && !report.ok) { put({ fx: fx.id, label, skipped: 'sabotage not harness-clean', issues: report.issues }); continue; }
      const res = await validatorAgent.run(
        {
          intent: fx.intent,
          action,
          report: { issues: report.issues, loaded: report.loaded, queries: await queryIntentsOf(ray, action as never) },
        },
        { llm: llm.llm },
      ).result;
      if (!res.ok) { put({ fx: fx.id, label, error: res.error.message }); console.log(`${fx.id}.${label}: validator errored`); continue; }
      const blockers = res.output.data.findings.filter((f) => f.severity === 'blocker');
      put({ fx: fx.id, label, verdict: res.output.data.verdict, findings: res.output.data.findings });
      if (label === 'good') { goodCases++; if (blockers.length > 0) falseAlarms++; }
      else { sabotages++; if (blockers.length > 0) caught++; }
      const flag = label === 'good'
        ? (blockers.length > 0 ? 'FALSE ALARM' : 'ok')
        : (blockers.length > 0 ? 'caught' : 'MISSED');
      const detail = blockers.length > 0 ? ` (${(blockers[0]?.claim ?? '').slice(0, 70)})` : '';
      console.log(`${fx.id.padEnd(10)} ${label.padEnd(10)} -> ${blockers.length > 0 ? 'BLOCKED' : 'passed '}  ${flag}${detail}`);
    }
  }
  console.log(`
precision: ${goodCases - falseAlarms}/${goodCases} good screens passed clean (${falseAlarms} false alarms)`);
  console.log(`recall   : ${caught}/${sabotages} sabotages caught`);
  console.log(`logs: ${outDir}`);
  process.exit(0);
};

void main();
