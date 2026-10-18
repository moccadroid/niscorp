import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CortexEvent } from '@niscorp/cortex';
import { buildScreen } from '@relay/screen-builder';
import { screenSetup } from '@relay/server/functions/ray/screens';
import { shell, runtime } from './check-shell';
import { assign, isModelId, llmFor } from '@relay/server/llm';
import { devRayContext } from './engine';

const INTENTS: Record<string, string> = {
  top10:
    'A table of the top 10 open deals by value, showing company, stage, value and close date. Click a row to open that deal.',
  byMonth:
    'A screen listing all deals whose close date falls in a selected month. A dropdown offers June, July and ' +
    'August; picking one reloads the table. Columns: deal title, company name, stage, value, close date. ' +
    'Clicking a row opens that deal (crm.deal.view).',
  search:
    'A searchable table of all companies showing name, industry and size. Typing in the search box filters the ' +
    'list live; clicking a row opens that company.',
  overview:
    'A pipeline overview: a headline KPI with the total value of open deals, and below it a table of pipeline ' +
    'stages with the open-deal count and combined value per stage, sorted by combined value descending. ' +
    'Clicking a stage row opens the deals list.',
  workspace:
    'A my-day workspace: my open tasks ordered by due date, a KPI of how many of my tasks are overdue, and a ' +
    'table of my 5 biggest open deals (company, value, close date) where clicking a deal opens it. ' +
    'A "New task" button opens the task form.',
  // Holdouts: shapes the teaching is never tuned on.
  feed:
    'A recent-activity feed: the 30 most recent activities (calls, emails, meetings, notes) showing type, ' +
    'subject and when it happened, newest first.',
  wonlost:
    'A table of deal owners showing, per owner, the owner name, how many deals they have won and how many ' +
    'they have lost, sorted by won count descending.',
  tasksWeek:
    'A table of all open tasks due in the next 7 days (today included), ordered by due date, showing title, ' +
    'assignee name and due date.',
  // Verbatim from a live chat trace: the intent Ray authored from a one-line request, embellishments included.
  rayIntent:
    "Create a new screen on the main canvas that shows a dropdown to select a month (June, July, August). " +
    "The selected month filters the deals displayed in a table to only those with a close_date in that month. " +
    "The table columns are: title, company, stage, value, close date. Clicking a row opens the deal view " +
    "(crm.deal.view) for that deal. The table should refresh automatically when the month dropdown changes. " +
    "Default view shows June deals. Include sorting by close date ascending.",
  // The owner's first request in the chat, 2026-10-18: its date filter never reached the query.
  expiry: 'A screen that lets me filter deals by expiry date: pick a from and a to date, and the table shows the deals closing between them.',
};

type Oracle = (db: typeof runtime.db, renderedRows: number | 'n/a') => Promise<string>;
const count = async (db: typeof runtime.db, sql: string): Promise<number> => (await db.query<{ n: number }>(sql)).rows[0]?.n ?? -1;
const ORACLES: Record<string, Oracle> = {
  top10: async (db, r) => {
    const want = Math.min(10, await count(db, "SELECT count(*)::int AS n FROM deals WHERE status='open'"));
    return r === want ? `PASS rendered ${String(r)} = top-${want}` : `FAIL rendered ${String(r)}, expected ${want}`;
  },
  byMonth: async (db, r) => {
    for (const [m, a, b] of [['June', '2026-06-01', '2026-06-30'], ['July', '2026-07-01', '2026-07-31'], ['August', '2026-08-01', '2026-08-31']]) {
      if (r === (await count(db, `SELECT count(*)::int AS n FROM deals WHERE close_date BETWEEN '${a}' AND '${b}'`))) return `PASS rendered ${String(r)} = ${m}'s exact count`;
    }
    return `FAIL rendered ${String(r)} matches no month (June/July/August counts differ)`;
  },
  search: async (db, r) => {
    const n = await count(db, 'SELECT count(*)::int AS n FROM companies');
    return r === n ? `PASS rendered all ${String(r)} companies` : `WARN rendered ${String(r)} of ${n} companies (a default LIMIT below the full set reads as truncation)`;
  },
  overview: async (db, r) => {
    const stages = await count(db, "SELECT count(DISTINCT stage_id)::int AS n FROM deals WHERE status='open'");
    return r === stages ? `PASS ${String(r)} stage rows = stages holding open deals` : `WARN rendered ${String(r)} rows, ${stages} stages hold open deals`;
  },
  workspace: async (_db, r) => `WARN exploratory — rendered:${String(r)} (multi-dataset; read the transcript)`,
  feed: async (db, r) => {
    const want = Math.min(30, await count(db, 'SELECT count(*)::int AS n FROM activities'));
    return r === want ? `PASS rendered ${String(r)} = newest ${want}` : `FAIL rendered ${String(r)}, expected ${want}`;
  },
  wonlost: async (db, r) => {
    const n = await count(db, "SELECT count(DISTINCT owner_id)::int AS n FROM deals WHERE status IN ('won','lost')");
    return r === n ? `PASS ${String(r)} owner rows = owners with won/lost deals` : `WARN rendered ${String(r)}, ${n} owners hold won/lost deals`;
  },
  tasksWeek: async (db, r) => {
    const n = await count(db, "SELECT count(*)::int AS n FROM tasks WHERE done = false AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7");
    return r === n ? `PASS rendered ${String(r)} = open tasks due within 7 days` : `WARN rendered ${String(r)}, SQL says ${n} (week-boundary readings differ)`;
  },
};

const trunc = (v: unknown, n = 6000): unknown => {
  const s = JSON.stringify(v);
  return s !== undefined && s.length > n ? `${s.slice(0, n)}…[+${s.length - n}]` : v;
};

type AnyNode = { type?: string; name?: string; ref?: string; props?: Record<string, unknown>; children?: AnyNode[] };

const findNode = (nodes: AnyNode[], match: (node: AnyNode) => boolean): AnyNode | undefined => {
  for (const node of nodes) {
    if (node.type === 'component' && match(node)) return node;
    const inner = node.children !== undefined ? findNode(node.children, match) : undefined;
    if (inner !== undefined) return inner;
  }
  return undefined;
};

const tree = (): AnyNode[] => shell.flattenRenderTree(shell.getCanvasRenderTree('main')) as AnyNode[];

const renderedRows = (): number | 'n/a' => {
  const table = findNode(tree(), (node) => node.name === 'Table');
  if (table === undefined) return 'n/a';
  const rows = table.props?.['rows'];
  return Array.isArray(rows) ? rows.length : 0;
};

// As the DOM does: a select or an input dispatches a string.
const typeInto = async (ref: string, value: unknown): Promise<number | 'n/a'> => {
  shell.dispatch({ type: 'ui:model', ref, payload: typeof value === 'string' || typeof value === 'number' ? String(value) : '' });
  await new Promise((resolve) => setTimeout(resolve, 1800));
  return renderedRows();
};

// The suite's own use of the screens whose request names an interaction, against the database.
const interactions = async (id: string): Promise<string[]> => {
  const found: string[] = [];
  if (id === 'byMonth' || id === 'rayIntent') {
    const select = findNode(tree(), (node) => node.name === 'Select');
    const options = (select?.props?.['options'] ?? []) as { value?: unknown; label?: unknown }[];
    for (const [month, a, b] of [['July', '2026-07-01', '2026-07-31'], ['August', '2026-08-01', '2026-08-31']] as const) {
      const option = Array.isArray(options) ? options.find((one) => String(one.label).includes(month)) : undefined;
      if (select?.ref === undefined || option === undefined) {
        found.push(`${month}: NO CONTROL`);
        continue;
      }
      const got = await typeInto(select.ref, option.value);
      const want = await count(runtime.db, `SELECT count(*)::int AS n FROM deals WHERE close_date BETWEEN '${a}' AND '${b}'`);
      found.push(`${month}: ${got === want ? 'PASS' : 'FAIL'} rendered ${String(got)}, SQL ${want}`);
    }
  }
  if (id === 'search') {
    const input = findNode(tree(), (node) => node.name === 'Input');
    if (input?.ref === undefined) found.push('typing: NO CONTROL');
    else {
      const typed = await typeInto(input.ref, 'an');
      const wantTyped = await count(runtime.db, "SELECT count(*)::int AS n FROM companies WHERE name ILIKE '%an%'");
      found.push(`type "an": ${typed === wantTyped ? 'PASS' : 'FAIL'} rendered ${String(typed)}, SQL ${wantTyped}`);
      const cleared = await typeInto(input.ref, '');
      const wantAll = await count(runtime.db, 'SELECT count(*)::int AS n FROM companies');
      found.push(`clear: ${cleared === wantAll ? 'PASS' : 'FAIL'} rendered ${String(cleared)}, SQL ${wantAll}`);
    }
  }
  if (id === 'expiry') {
    const inputs: AnyNode[] = [];
    const collect = (nodes: AnyNode[]): void => {
      for (const node of nodes) {
        if (node.type === 'component' && node.name === 'Input' && node.ref !== undefined) inputs.push(node);
        if (node.children !== undefined) collect(node.children);
      }
    };
    collect(tree());
    const [from, to] = inputs;
    if (from?.ref === undefined || to?.ref === undefined) found.push('dates: NO CONTROLS (two Inputs with refs)');
    else {
      await typeInto(from.ref, '2026-07-01');
      const got = await typeInto(to.ref, '2026-07-31');
      const want = await count(runtime.db, "SELECT count(*)::int AS n FROM deals WHERE close_date BETWEEN '2026-07-01' AND '2026-07-31'");
      found.push(`July range: ${got === want ? 'PASS' : 'FAIL'} rendered ${String(got)}, SQL ${want}`);
    }
  }
  return found;
};

type RunRow = { intent: string; rep: number; ok: boolean; seconds: number; tools: number; retries: Record<string, number>; liveRows: number | 'n/a'; note: string };

const main = async (): Promise<void> => {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const reps = Number(process.argv.find((a) => a.startsWith('--reps='))?.slice(7) ?? '1');
  const model = process.argv.find((a) => a.startsWith('--model='))?.slice(8);
  if (model !== undefined) {
    if (!isModelId(model)) {
      console.error(`unknown model "${model}"`);
      process.exit(2);
    }
    assign('architect', model);
  }
  const llm = llmFor('architect');
  if ('error' in llm) {
    console.error(llm.error);
    process.exit(2);
  }
  const outDir = join(process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? join(tmpdir(), 'relay-architect-suite'), new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(outDir, { recursive: true });
  console.log(`suite → ${outDir}\n`);

  const setup = screenSetup(devRayContext({ shell, roles: ['sales', 'dev'], runtime }));
  const rows: RunRow[] = [];
  for (const [id, intent] of Object.entries(INTENTS)) {
    if (only !== undefined && !only.includes(id)) continue;
    for (let rep = 1; rep <= reps; rep++) {
      const log = join(outDir, `${id}.${rep}.jsonl`);
      const put = (o: Record<string, unknown>): void => appendFileSync(log, JSON.stringify({ t: Date.now(), ...o }) + '\n');
      put({ ev: 'intent', id, rep, intent });
      const retries: Record<string, number> = {};
      let tools = 0;
      const onEvent = (e: CortexEvent): void => {
        if (e.type === 'tool-start') {
          tools++;
          put({ ev: 'tool-start', path: e.agentPath, tool: e.call.toolId, input: trunc(e.call.args) });
        }
        if (e.type === 'tool-end') {
          const o = e.observation;
          put({ ev: 'tool-end', tool: o.toolId, kind: o.kind, ...(o.kind === 'result' ? { output: trunc(o.result), ms: o.durationMs } : {}), ...(o.kind === 'error' ? { error: trunc(o.error), ms: o.durationMs } : {}) });
        }
        if (e.type === 'retry') {
          retries[e.kind] = (retries[e.kind] ?? 0) + 1;
          put({ ev: 'retry', kind: e.kind, attempt: e.attempt, issues: e.issues });
        }
        if (e.type === 'run-end') put({ ev: 'run-end', path: e.agentPath, ...(e.result.ok ? { ok: true } : { ok: false, error: e.result.error.message }), steps: e.meta.steps, usage: e.meta.usage });
      };

      const t0 = Date.now();
      const built = await buildScreen(intent, setup, { llm: llm.llm, onEvent });
      const seconds = Math.round((Date.now() - t0) / 100) / 10;

      let liveRows: number | 'n/a' = 'n/a';
      let note = '';
      if (built.ok) {
        put({ ev: 'built', action: built.action, probes: built.probes });
        writeFileSync(join(outDir, `${id}.${rep}.action.json`), JSON.stringify({ action: built.action, probes: built.probes }, null, 2));
        shell.registerAction(built.action);
        const instance = shell.push('main', built.action.id);
        const rt = shell.getRuntime(instance);
        if (rt !== undefined) {
          await new Promise<void>((resolve) => {
            if (rt.instance.status === 'active') return resolve();
            const off = rt.onStatusChange((status: string) => {
              if (status === 'active' || status === 'unmounted') {
                off();
                resolve();
              }
            });
            setTimeout(resolve, 20000);
          });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          liveRows = renderedRows();
          put({ ev: 'live-mount', renderedRows: liveRows, dataKeys: Object.keys(rt.getData()) });
          const used = await interactions(id);
          if (used.length > 0) {
            put({ ev: 'interactions', results: used });
            note = used.join('; ');
          }
        } else note = 'no runtime after push';
        shell.removeAction(built.action.id);
        const oracle = (await ORACLES[id]?.(runtime.db, liveRows)) ?? '';
        put({ ev: 'oracle', verdict: oracle });
        note = [note, oracle].filter((part) => part.length > 0).join(' | ');
      } else {
        note = built.error.slice(0, 160);
        put({ ev: 'failed', error: built.error, findings: built.findings, candidate: built.candidate === undefined ? null : trunc(built.candidate, 12000) });
      }
      rows.push({ intent: id, rep, ok: built.ok, seconds, tools, retries, liveRows, note });
      console.log(`${id}#${rep}  ${built.ok ? 'OK ' : 'FAIL'} ${String(seconds).padStart(5)}s  tools:${tools}  retries:${JSON.stringify(retries)}  LIVE:${liveRows}${note ? `  — ${note}` : ''}`);
    }
  }

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(rows, null, 2));
  const live = rows.filter((r) => typeof r.liveRows === 'number' && r.liveRows > 0).length;
  console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} built, ${live}/${rows.length} put rows on the live screen. Logs: ${outDir}`);
  process.exit(0);
};

void main();
