// Locked check — the human-facing vex surface is replay-only. Every read any
// action makes must replay from the protected seeds; a novel or drifted
// shape gets 400 `locked`; fingerprint management gets 403; the closed
// mutation grammar still writes. Drives vexFetch itself — the exact surface
// the shell's endpoints hit.
import { ENTRIES, MUTATIONS } from '@relay/api';
import { vexFetch } from '@relay/vex/http';
import { identity, signIn, mintToken } from '../auth';

const checks: [string, boolean][] = [];

const post = async (body: unknown, method = 'POST'): Promise<{ status: number; body: Record<string, unknown> }> => {
  const res = await vexFetch('/api/vex', { method, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const run = async (): Promise<void> => {
  const token = mintToken('alex');
  if (token === null) throw new Error('cannot mint alex');
  signIn(token);
  if (identity() === null) throw new Error('no identity');

  // ── every protected seed replays under lock ──
  let replayed = 0;
  const broken: string[] = [];
  for (const entry of ENTRIES) {
    const res = await post({ fingerprint: entry.fingerprint, context: {} });
    if (res.status === 200) replayed += 1;
    else broken.push(`${entry.fingerprint} → ${res.status} ${String(res.body['error'])}`);
  }
  checks.push([`all ${ENTRIES.length} seeded fingerprints replay (${replayed}/${ENTRIES.length}${broken.length > 0 ? ` — ${broken.join('; ')}` : ''})`, broken.length === 0]);

  // ── a novel shape cannot generate here ──
  const novel = await post({ intent: 'all contacts with their emails', shape: { contacts: [{ id: 'string', email: 'string' }] }, context: {} });
  checks.push([`a novel read is 400 locked (got ${novel.status} ${String(novel.body['error'])})`, novel.status === 400 && novel.body['error'] === 'locked']);

  // ── an unknown fingerprint is a miss, and misses never generate ──
  const unknown = await post({ fingerprint: 'contacts/doesNotExist', context: {} });
  checks.push([`an unknown fingerprint is 404 cache_miss (got ${unknown.status} ${String(unknown.body['error'])})`, unknown.status === 404 && unknown.body['error'] === 'cache_miss']);

  // ── fingerprint management is refused ──
  const patch = await post({ fingerprint: ENTRIES[0]!.fingerprint, protected: false }, 'PATCH');
  checks.push([`PATCH is 403 locked (got ${patch.status})`, patch.status === 403 && patch.body['error'] === 'locked']);
  const del = await post({ fingerprint: ENTRIES[0]!.fingerprint }, 'DELETE');
  checks.push([`DELETE is 403 locked (got ${del.status})`, del.status === 403 && del.body['error'] === 'locked']);

  // ── the closed mutation grammar still writes (the def travels inline,
  //    exactly as the form seams send it) ──
  const write = await post({ mutation: MUTATIONS['task.upsert'], context: { id: '', title: 'Locked probe', due_date: null, deal_id: null } });
  checks.push([`a mutation still writes under lock (got ${write.status})`, write.status === 200]);

  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  }
  if (failed > 0) {
    console.log(`\nFAIL — ${failed} check(s).`);
    process.exit(1);
  }
  console.log('\nOK — replay-only: the seeds are the API surface, nothing else exists.');
  process.exit(0);
};

void run();
