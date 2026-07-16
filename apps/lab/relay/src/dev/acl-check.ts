// ACL check — the charter/vex marriage, end to end through the WIRE. A
// principal's charter `data` grants compile to a vex ScopePolicy; the
// untrusted vexFetch surface enforces it. A viewer holds no write phase, so
// their mark-won is refused by vex's own default-deny (scope_denied) — not a
// gate we added, one charter never emitted. Sales holds the phase, so theirs
// lands. Reads honor the same policy. Nothing here touches vex internals.
import { vexFetch } from '@relay/vex/http';
import { getVexRuntime } from '@relay/vex/runtime';
import { signIn, signOut, mintToken } from '../auth';

const checks: [string, boolean][] = [];

const post = async (body: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
  const res = await vexFetch('/api/vex', { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const as = (username: string): void => {
  const t = mintToken(username);
  if (t === null) throw new Error(`unknown user ${username}`);
  signIn(t);
};

const run = async (): Promise<void> => {
  const rt = await getVexRuntime();
  const openDeal = (await rt.db.query("SELECT id FROM deals WHERE status='open' LIMIT 1")).rows[0] as { id: string };
  const myTask = (await rt.db.query("SELECT id FROM tasks WHERE assignee_id='usr_002' LIMIT 1")).rows[0] as { id: string } | undefined;

  // ── jordan is a VIEWER: no write phase in their compiled policy ──
  as('jordan');
  const vWon = await post({ fingerprint: 'deals/markWon', context: { deal_id: openDeal.id } });
  checks.push([`viewer's markWon is refused (got ${vWon.status} ${String(vWon.body['error'])})`, vWon.status === 400 && vWon.body['error'] === 'scope_denied']);

  // Even a task they "own" — viewer has no tasks.write phase at all.
  const vTask = await post({ fingerprint: 'tasks/setDone', context: { id: myTask?.id ?? 'x', done: true } });
  checks.push([`viewer cannot write their own task either (got ${String(vTask.body['error'])})`, vTask.status === 400 && vTask.body['error'] === 'scope_denied']);

  // Reads honor the same policy — a viewer holds every read phase, so a list read works.
  const vRead = await post({ fingerprint: 'deals/list', context: { q: ' ' } });
  checks.push([`viewer can still READ deals (got ${vRead.status})`, vRead.status === 200]);

  // ── anonymous holds NO phases (public has no data section): reads die too —
  //    the only principal that proves a DENIED READ through the wire ──
  signOut();
  const aRead = await post({ fingerprint: 'deals/list', context: { q: ' ' } });
  checks.push([`anonymous cannot read deals (got ${aRead.status} ${String(aRead.body['error'])})`, aRead.status === 400 && aRead.body['error'] === 'scope_denied']);

  // ── alex is SALES: holds deals.write.update, NOT deals.write.delete ──
  as('alex');
  const sWon = await post({ fingerprint: 'deals/markWon', context: { deal_id: openDeal.id } });
  checks.push([`sales's markWon lands (got ${sWon.status})`, sWon.status === 200]);
  const won = (await rt.db.query('SELECT status FROM deals WHERE id = $1', [openDeal.id])).rows[0] as { status: string };
  checks.push([`the deal is actually won (got ${won.status})`, won.status === 'won']);

  // The verb tier: update ≠ delete. Sales edits deals all day; deleting a
  // shared record is a phase their compiled policy simply doesn't have.
  const sDel = await post({ fingerprint: 'deals/delete', context: { id: openDeal.id } });
  checks.push([`sales's delete is refused (got ${sDel.status} ${String(sDel.body['error'])})`, sDel.status === 400 && sDel.body['error'] === 'scope_denied']);

  // ── sam is ADMIN: the delete phase exists for them ──
  as('sam');
  const aDel = await post({ fingerprint: 'deals/delete', context: { id: openDeal.id } });
  checks.push([`admin's delete lands (got ${aDel.status})`, aDel.status === 200]);
  const gone = (await rt.db.query('SELECT id FROM deals WHERE id = $1', [openDeal.id])).rows;
  checks.push(['the deal is actually gone', gone.length === 0]);

  signOut();

  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  }
  if (failed > 0) {
    console.log(`\nFAIL — ${failed} check(s).`);
    process.exit(1);
  }
  console.log('\nOK — charter compiles the vex policy; the verb a principal was never granted dies in vex.');
  process.exit(0);
};

void run();
