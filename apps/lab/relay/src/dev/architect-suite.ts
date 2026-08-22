// The architect under a MICROSCOPE, against the metric that matters.
//
// Each run: build an intent → gate → register on the REAL server shell →
// mount → count the rows a person would see. "The harness said ok" is not a
// result; LIVE ROWS is the result. Everything the run said and heard —
// every tool call with its input and output, every correction with its full
// issues text, the final artifact or the failed candidate — lands in one
// JSONL per run, so a failure is a transcript to read, not a vibe.
//
//   pnpm --filter relay exec tsx src/dev/architect-suite.ts
//     [--only=<id>] [--reps=N] [--pipeline]   (default: every intent, 2 reps)
//
// --pipeline runs the REAL `build_action` tool — build, harness, the
// validator's review, and one repair — the exact path a chat request takes.
// The reviewer's findings land in the log and the summary, so intent-fit
// misses (a query that quietly ignored a filter) finally get scored.
//
// Reps share one server and one cache, deliberately: rep 2 sees rep 1's
// fingerprints in discover, exactly as a warm production server would.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CortexEvent } from '@niscorp/cortex';
import { shell, runtime } from './check-shell';
import { architectLlms, makeBuildActionTool, runActionArchitect } from '@relay/server/functions/ray/architect';
import { assign, isModelId } from '@relay/server/llm';
import { rayEngine, type RayContext } from '@relay/server/functions/ray/engine';
import { createScopePolicy, scopeGrants } from '@niscorp/vex';
import { resolvePrincipal } from '@niscorp/charter';
import { CHARTER } from '@relay/app/charter';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { TABLES } from '@relay/db/schema';

export const INTENTS: Record<string, string> = {
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
  // ── HOLDOUTS: shapes the teaching was never tuned on. If these pass, the
  // fixes generalized; if they fail, we taught to the test.
  feed:
    'A recent-activity feed: the 30 most recent activities (calls, emails, meetings, notes) showing type, ' +
    'subject and when it happened, newest first.',
  wonlost:
    'A table of deal owners showing, per owner, the owner name, how many deals they have won and how many ' +
    'they have lost, sorted by won count descending.',
  tasksWeek:
    'A table of all open tasks due in the next 7 days (today included), ordered by due date, showing title, ' +
    'assignee name and due date.',
  // RAY'S OWN WORDS, verbatim from a live chat trace — the intent Ray authored
  // from the user's one-line request, embellishments included (auto-refresh,
  // default month, sorting the user never asked for). The suite's curated
  // intents never reproduced chat behavior; this is the like-for-like test.
  rayIntent:
    "Create a new screen on the main canvas that shows a dropdown to select a month (June, July, August). " +
    "The selected month filters the deals displayed in a table to only those with a close_date in that month. " +
    "The table columns are: title, company, stage, value, close date. Clicking a row opens the deal view " +
    "(crm.deal.view) for that deal. The table should refresh automatically when the month dropdown changes. " +
    "Default view shows June deals. Include sorting by close date ascending.",
};

// ── ORACLES: the database's own truth, per intent. "Rows rendered" is
// necessary; "the RIGHT rows rendered" is the actual bar. Each returns a
// verdict string starting PASS/WARN/FAIL.
type Oracle = (db: typeof runtime.db, dataRows: number | 'n/a', renderedRows: number | 'n/a', artifact: unknown) => Promise<string>;
const count = async (db: typeof runtime.db, sql: string): Promise<number> =>
  ((await db.query<{ n: number }>(sql)).rows[0]?.n ?? -1);
const ORACLES: Record<string, Oracle> = {
  top10: async (db, _d, r) => {
    const open = await count(db, "SELECT count(*)::int AS n FROM deals WHERE status='open'");
    const want = Math.min(10, open);
    return r === want ? `PASS rendered ${String(r)} = top-${want}` : `FAIL rendered ${String(r)}, expected ${want}`;
  },
  byMonth: async (db, _d, r) => {
    for (const [m, a, b] of [['June', '2026-06-01', '2026-06-30'], ['July', '2026-07-01', '2026-07-31'], ['August', '2026-08-01', '2026-08-31']]) {
      const n = await count(db, `SELECT count(*)::int AS n FROM deals WHERE close_date BETWEEN '${a}' AND '${b}'`);
      if (r === n) return `PASS rendered ${String(r)} = ${m}'s exact count`;
    }
    return `FAIL rendered ${String(r)} matches no month (June/July/August counts differ)`;
  },
  search: async (db, _d, r) => {
    const n = await count(db, 'SELECT count(*)::int AS n FROM companies');
    return r === n ? `PASS rendered all ${String(r)} companies` : `WARN rendered ${String(r)} of ${n} companies (a default LIMIT below the full set reads as truncation)`;
  },
  overview: async (db, d, r) => {
    const stages = await count(db, "SELECT count(DISTINCT stage_id)::int AS n FROM deals WHERE status='open'");
    return r === stages ? `PASS ${String(r)} stage rows = stages holding open deals` : `WARN rendered ${String(r)} rows, ${stages} stages hold open deals (data:${String(d)})`;
  },
  workspace: async (_db, d, r) => `WARN exploratory — data:${String(d)} rendered:${String(r)} (multi-dataset; read the transcript)`,
  feed: async (db, _d, r) => {
    const n = await count(db, 'SELECT count(*)::int AS n FROM activities');
    const want = Math.min(30, n);
    return r === want ? `PASS rendered ${String(r)} = newest ${want}` : `FAIL rendered ${String(r)}, expected ${want}`;
  },
  wonlost: async (db, _d, r) => {
    const n = await count(db, "SELECT count(DISTINCT owner_id)::int AS n FROM deals WHERE status IN ('won','lost')");
    return r === n ? `PASS ${String(r)} owner rows = owners with won/lost deals` : `WARN rendered ${String(r)}, ${n} owners hold won/lost deals`;
  },
  tasksWeek: async (db, _d, r) => {
    const n = await count(db, "SELECT count(*)::int AS n FROM tasks WHERE done = false AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7");
    return r === n ? `PASS rendered ${String(r)} = open tasks due within 7 days` : `WARN rendered ${String(r)}, SQL says ${n} (week-boundary readings differ)`;
  },
};

const trunc = (v: unknown, n = 6000): unknown => {
  const s = JSON.stringify(v);
  return s !== undefined && s.length > n ? `${s.slice(0, n)}…[+${s.length - n}]` : v;
};

type RunRow = {
  intent: string; rep: number; ok: boolean; seconds: number;
  retries: Record<string, number>; tools: number; liveRows: number | 'n/a'; note: string;
};

const main = async (): Promise<void> => {
  const llms = architectLlms();
  if ('error' in llms) { console.error(llms.error); process.exit(2); }
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
  const reps = Number(process.argv.find((a) => a.startsWith('--reps='))?.slice(7) ?? '2');
  const pipeline = process.argv.includes('--pipeline');
  // --model=<roster id>: put the ARCHITECT (and reviewer) on one model for this
  // run. Without it the suite silently tests the code default — which is how
  // every chat pain on GLM went unreproduced while the suite glowed green on
  // 120b. The suite must run what the chat runs.
  const model = process.argv.find((a) => a.startsWith('--model='))?.slice(8);
  if (model !== undefined) {
    if (!isModelId(model)) { console.error(`unknown model "${model}"`); process.exit(2); }
    assign('architect', model);
    assign('validator', model);
    console.log(`architect+validator on: ${model}`);
  }

  const outDir = join(
    'C:/Users/manxx/AppData/Local/Temp/claude/C--Users-manxx-Development-niscorp/2dcaa551-d6ad-4235-a03c-dfd279d85e40/scratchpad',
    'architect-suite',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  mkdirSync(outDir, { recursive: true });
  console.log(`suite → ${outDir}\n`);

  const policy = createScopePolicy(resolvePrincipal(CHARTER, scopeGrants(TABLES), ['sales', 'dev'], 'data'), scopeBehaviors);
  const ray: RayContext = { shell, userId: 'usr_001', policy, engine: () => rayEngine(runtime, policy) };

  const rows: RunRow[] = [];
  for (const [id, intent] of Object.entries(INTENTS)) {
    if (only !== undefined && id !== only) continue;
    for (let rep = 1; rep <= reps; rep++) {
      const log = join(outDir, `${id}.${rep}.jsonl`);
      const put = (o: Record<string, unknown>): void => appendFileSync(log, JSON.stringify({ t: Date.now(), ...o }) + '\n');
      put({ ev: 'intent', id, rep, intent });

      const retries: Record<string, number> = {};
      let tools = 0;
      const onEvent = (e: CortexEvent): void => {
        if (e.type === 'tool-start') { tools++; put({ ev: 'tool-start', path: e.agentPath, tool: e.call.toolId, input: trunc(e.call.args) }); }
        if (e.type === 'tool-end') {
          const o = e.observation;
          put({ ev: 'tool-end', tool: o.toolId, kind: o.kind,
            ...(o.kind === 'result' ? { output: trunc(o.result), ms: o.durationMs } : {}),
            ...(o.kind === 'error' ? { error: trunc(o.error), ms: o.durationMs } : {}) });
        }
        if (e.type === 'retry') { retries[e.kind] = (retries[e.kind] ?? 0) + 1; put({ ev: 'retry', kind: e.kind, attempt: e.attempt, issues: e.issues }); }
      };

      const t0 = Date.now();
      // One tool per run: its same-session edit memory is not under test here.
      const buildTool = pipeline ? makeBuildActionTool(ray) : undefined;
      let built: Awaited<ReturnType<typeof runActionArchitect>>;
      let review = '';
      if (buildTool !== undefined) {
        const out = await buildTool.config.execute({ intent }, {
          runId: 'suite', agentId: 'suite', agentPath: ['suite'],
          signal: new AbortController().signal, forward: onEvent,
        });
        if (typeof out === 'string') {
          built = { ok: false, error: out, issues: [] };
        } else {
          const traced = out as { forModel?: unknown; forTrace?: { action?: unknown; findings?: { severity: string; claim: string }[] } };
          const findings = traced.forTrace?.findings ?? [];
          review = `review: ${String(traced.forModel).replace(/^.*?(Verified|UNRESOLVED|review unavailable)/s, '$1').slice(0, 140)}`;
          put({ ev: 'review', forModel: traced.forModel, findings });
          built = traced.forTrace?.action !== undefined
            ? { ok: true, action: traced.forTrace.action as never, proofs: new Map() }
            : { ok: false, error: String(traced.forModel).slice(0, 200), issues: [] };
        }
      } else {
        built = await runActionArchitect(ray, llms.agent, llms.support, intent, { onEvent });
      }
      const seconds = Math.round((Date.now() - t0) / 100) / 10;

      let liveRows: number | 'n/a' = 'n/a';
      let note = '';
      if (built.ok) {
        put({ ev: 'built', action: built.action });
        writeFileSync(join(outDir, `${id}.${rep}.action.json`), JSON.stringify(built.action, null, 2));
        // ── the metric: mount on the REAL shell, count what a person sees ──
        if (buildTool === undefined) shell.registerAction(built.action);
        const iid = buildTool !== undefined
          ? (shell.getCanvasState('main').active?.id ?? shell.push('main', built.action.id))
          : shell.push('main', built.action.id);
        const rt = shell.getRuntime(iid);
        if (rt !== undefined) {
          await new Promise<void>((resolve) => {
            if (rt.instance.status === 'active') return resolve();
            const off = rt.onStatusChange((s2: string) => { if (s2 === 'active' || s2 === 'unmounted') { off(); resolve(); } });
            setTimeout(resolve, 20000);
          });
          await new Promise((r) => setTimeout(r, 2000));
          const data = rt.getData() as Record<string, unknown>;
          const arr = Object.values(data).find(Array.isArray);
          const dataRows = Array.isArray(arr) ? arr.length : 0;
          // The metric that matters is what the Table RENDERS, not what the
          // data holds — they diverge exactly when a binding is broken (a
          // prism node in a prop hands the component garbage over loaded
          // data), the failure every data-side check waves through.
          type AnyNode = { type?: string; name?: string; props?: Record<string, unknown>; children?: AnyNode[] };
          const findTableRows = (nodes: AnyNode[]): number | 'n/a' => {
            for (const node of nodes) {
              if (node.type === 'component' && node.name === 'Table') {
                const r = node.props?.['rows'];
                return Array.isArray(r) ? r.length : 0;
              }
              const inner = node.children !== undefined ? findTableRows(node.children) : 'n/a';
              if (inner !== 'n/a') return inner;
            }
            return 'n/a';
          };
          const renderedNow = (): number | 'n/a' =>
            findTableRows(shell.flattenRenderTree(shell.getCanvasRenderTree('main')) as AnyNode[]);
          const rendered = renderedNow();
          liveRows = rendered === 'n/a' ? dataRows : rendered;
          put({ ev: 'live-mount', dataRows, renderedRows: rendered, dataKeys: Object.keys(data) });
          if (rendered !== 'n/a' && rendered !== dataRows) note = `RENDER≠DATA: table renders ${rendered}, data holds ${dataRows}`;

          // ── INTERACTION PROBES: drive the screen the way a person would.
          // Mount only ever exercises the DEFAULT state; every other branch —
          // the July option, the search keystroke — shipped on faith until
          // here. Probes find the real control in the RENDERED tree (its ref
          // and its option values are the artifact's own), dispatch the real
          // event, and hold the re-rendered table to SQL truth.
          const findNode = (nodes: AnyNode[], match: (n: AnyNode) => boolean): AnyNode | undefined => {
            for (const n of nodes) {
              if (n.type === 'component' && match(n)) return n;
              const inner = n.children !== undefined ? findNode(n.children, match) : undefined;
              if (inner !== undefined) return inner;
            }
            return undefined;
          };
          type RNode = AnyNode & { ref?: string };
          const dispatchModel = async (ref: string, payload: unknown): Promise<number | 'n/a'> => {
            // The DOM's contract, not a kind one: a <select>/<input> dispatches
            // e.target.value — a STRING. An object option value becomes ''.
            // The probe dispatches exactly that, so a screen that only works
            // when handed raw objects fails HERE, not in the user's browser.
            const domPayload = typeof payload === 'string' || typeof payload === 'number' ? String(payload) : '';
            shell.dispatch({ type: 'ui:model', ref, payload: domPayload, origin: iid } as never);
            await new Promise((r) => setTimeout(r, 1800));
            return renderedNow();
          };
          const probes: string[] = [];
          const tree = (): AnyNode[] => shell.flattenRenderTree(shell.getCanvasRenderTree('main')) as AnyNode[];
          if (id === 'byMonth') {
            const select = findNode(tree(), (n) => n.name === 'Select') as RNode | undefined;
            const options = (select?.props?.['options'] ?? []) as { value?: unknown; label?: unknown }[];
            for (const [month, a, b] of [['July', '2026-07-01', '2026-07-31'], ['August', '2026-08-01', '2026-08-31']] as const) {
              const option = Array.isArray(options) ? options.find((o) => String(o.label).includes(month)) : undefined;
              if (select?.ref === undefined || option === undefined) { probes.push(`${month}: NO CONTROL (select/option not found in render)`); continue; }
              const got = await dispatchModel(select.ref, option.value);
              const want = await count(runtime.db, `SELECT count(*)::int AS n FROM deals WHERE close_date BETWEEN '${a}' AND '${b}'`);
              probes.push(`${month}: ${got === want ? 'PASS' : 'FAIL'} rendered ${String(got)}, SQL ${want}`);
            }
          }
          if (id === 'search') {
            const input = findNode(tree(), (n) => n.name === 'Input' || n.name === 'Textarea') as RNode | undefined;
            if (input?.ref === undefined) probes.push('typing: NO CONTROL (no Input with a ref in render)');
            else {
              const typed = await dispatchModel(input.ref, 'an');
              const wantTyped = await count(runtime.db, "SELECT count(*)::int AS n FROM companies WHERE name ILIKE '%an%'");
              probes.push(`type "an": ${typed === wantTyped ? 'PASS' : 'FAIL'} rendered ${String(typed)}, SQL ${wantTyped}`);
              const cleared = await dispatchModel(input.ref, '');
              const wantAll = await count(runtime.db, 'SELECT count(*)::int AS n FROM companies');
              probes.push(`clear: ${cleared === wantAll ? 'PASS' : 'FAIL'} rendered ${String(cleared)}, SQL ${wantAll}`);
            }
          }
          if (probes.length > 0) {
            put({ ev: 'probes', results: probes });
            note = `${note.length > 0 ? note + ' | ' : ''}${probes.join('; ')}`;
          }
        } else { note = 'no runtime after push'; }
        shell.removeAction((built.action as { id: string }).id);
        if (review.length > 0) note = `${note.length > 0 ? note + ' | ' : ''}${review}`;
      } else {
        note = built.error.slice(0, 120);
        put({ ev: 'failed', error: built.error, issues: built.issues ?? [], candidate: built.candidate !== undefined ? trunc(built.candidate, 12000) : null });
      }

      let oracle = '';
      if (built.ok) {
        oracle = await (ORACLES[id]?.(runtime.db, liveRows, liveRows, built.action) ?? Promise.resolve(''));
        put({ ev: 'oracle', verdict: oracle });
      }
      const label = note.length > 0 ? note : oracle;
      rows.push({ intent: id, rep, ok: built.ok, seconds, retries, tools, liveRows, note: label });
      console.log(`${id}#${rep}  ${built.ok ? 'OK ' : 'FAIL'} ${String(seconds).padStart(5)}s  tools:${tools}  retries:${JSON.stringify(retries)}  LIVE:${liveRows}${label ? `  — ${label}` : ''}`);
    }
  }

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(rows, null, 2));
  const live = rows.filter((r) => typeof r.liveRows === 'number' && r.liveRows > 0).length;
  console.log(`\n${live}/${rows.length} runs put rows on the live screen. Logs: ${outDir}`);
  process.exit(0);
};

// Run only as an entrypoint — validator-suite imports INTENTS from here, and
// an import that silently launches eight LLM builds is a landmine.
if (process.argv[1]?.endsWith('architect-suite.ts') === true) void main();
