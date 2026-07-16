// RLS check — ring 3 as vex ScopePolicy: default-deny entities, task reads
// scoped to the assignee, mutations stamped + pinned server-side. Drives the
// ENGINE with explicit scopes (the app derives its scope from the token);
// ground truth is raw SQL against the same PGlite.
import { evaluate } from '@niscorp/prism';
import type { QueryRequest } from '@niscorp/vex';
import { getVexRuntime, todayStr } from '@relay/vex/runtime';
import { scopePolicy } from '@relay/vex/scope';
import { executeMutation } from '@niscorp/vex';
import { taskUpsert, taskSetDone, taskDelete } from '@relay/api/tasks';
import { listTasksPrism } from '@relay/nova/domains/task/tasks.prism';

const checks: [string, boolean][] = [];

const run = async (): Promise<void> => {
  const rt = await getVexRuntime();
  const schema = rt.engine.getSchema();
  if (schema === undefined) throw new Error('Vex schema not introspected');
  const q = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
    (await rt.db.query(sql, params)).rows as Record<string, unknown>[];

  // The tasks screen's own seam, replayed per principal. `contextUserId` is
  // what the CLIENT claims; `scope` is what the SERVER injects from the token.
  const taskIds = async (contextUserId: string, scopeUserId: string): Promise<Set<string>> => {
    const state = { scope: 'all', search: '', sortBy: 'tasks.due_date', sortDir: 'asc', userId: contextUserId, today: todayStr() };
    const request = evaluate(listTasksPrism as Parameters<typeof evaluate>[0], state) as QueryRequest;
    const res = (await rt.engine.execute(request, { scope: { userId: scopeUserId } })) as { result: { task_id: string }[] };
    return new Set(res.result.map((r) => r.task_id));
  };

  // ── reads are assignee-scoped, per principal ──
  const alex = await taskIds('usr_001', 'usr_001');
  const jordan = await taskIds('usr_002', 'usr_002');
  checks.push([`alex sees tasks (${alex.size})`, alex.size > 0]);
  checks.push([`jordan sees tasks (${jordan.size})`, jordan.size > 0]);
  checks.push(['the two sets are disjoint', [...alex].every((id) => !jordan.has(id))]);

  // ── the floor: a spoofed $context.userId cannot widen the read — scope
  //    ANDs the RLS filter regardless of what the request claims ──
  const spoofed = await taskIds('usr_001', 'usr_002');
  checks.push([`claiming alex under jordan's token yields nothing (got ${spoofed.size})`, spoofed.size === 0]);

  // ── INSERT stamps the assignee from scope; the grammar has no way to say it ──
  await executeMutation(rt.db, taskUpsert.mutation, {
    context: { id: '', title: 'RLS probe', due_date: null, deal_id: null },
    scope: { userId: 'usr_002' },
    policy: scopePolicy,
    schema,
  });
  const probe = await q(`SELECT assignee_id FROM tasks WHERE title = 'RLS probe'`);
  checks.push([`insert as jordan lands stamped assignee_id=usr_002 (got ${String(probe[0]?.['assignee_id'])})`, probe[0]?.['assignee_id'] === 'usr_002']);

  // ── UPDATE/DELETE are pinned: another principal's task is untouchable ──
  const target = [...alex][0]!;
  const doneBefore = (await q('SELECT done FROM tasks WHERE id = $1', [target]))[0]?.['done'];
  await executeMutation(rt.db, taskSetDone.mutation, { context: { id: target, done: !(doneBefore as boolean) }, scope: { userId: 'usr_002' }, policy: scopePolicy, schema });
  const doneAfterSpoof = (await q('SELECT done FROM tasks WHERE id = $1', [target]))[0]?.['done'];
  checks.push(["jordan cannot flip alex's task (done unchanged)", doneAfterSpoof === doneBefore]);
  await executeMutation(rt.db, taskDelete.mutation, { context: { id: target }, scope: { userId: 'usr_002' }, policy: scopePolicy, schema });
  const stillThere = await q('SELECT id FROM tasks WHERE id = $1', [target]);
  checks.push(["jordan cannot delete alex's task", stillThere.length === 1]);
  await executeMutation(rt.db, taskSetDone.mutation, { context: { id: target, done: !(doneBefore as boolean) }, scope: { userId: 'usr_001' }, policy: scopePolicy, schema });
  const doneAfterOwn = (await q('SELECT done FROM tasks WHERE id = $1', [target]))[0]?.['done'];
  checks.push(['alex flips his own task fine', doneAfterOwn === !(doneBefore as boolean)]);

  // ── default deny: an entity with no write rule refuses writes outright ──
  let deniedCode = '';
  try {
    await executeMutation(rt.db, { op: 'delete', table: 'pipelines', where: { eq: ['pipelines.id', { $context: 'id' }] } } as never, {
      context: { id: 'pipe_001' },
      scope: { userId: 'usr_001' },
      policy: scopePolicy,
      schema,
    });
  } catch (e) {
    deniedCode = (e as { code?: string }).code ?? '';
  }
  checks.push([`a write to an unruled entity is scope_denied (got "${deniedCode}")`, deniedCode === 'scope_denied']);

  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  }
  if (failed > 0) {
    console.log(`\nFAIL — ${failed} check(s).`);
    process.exit(1);
  }
  console.log('\nOK — reads filtered, writes stamped and pinned, unlisted entities denied. Ring 3 is the floor.');
  process.exit(0);
};

void run();
