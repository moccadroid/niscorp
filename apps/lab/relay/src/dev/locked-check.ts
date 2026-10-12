import { ENTRIES, MUTATION_ENTRIES } from '@relay/app/vex';
import { taskUpsert, taskSetDone } from '@relay/app/vex/tasks.entries';
import { wire, login } from './check-shell';

const checks: [string, boolean][] = [];

const post = async (body: unknown, method = 'POST'): Promise<{ status: number; body: Record<string, unknown> }> => {
  const res = await wire('/api/vex', { method, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const run = async (): Promise<void> => {
  await login('alex');

  let replayed = 0;
  const broken: string[] = [];
  for (const entry of ENTRIES) {
    const res = await post({ fingerprint: entry.fingerprint, context: {} });
    if (res.status === 200) replayed += 1;
    else broken.push(`${entry.fingerprint} → ${res.status} ${String(res.body['error'])}`);
  }
  checks.push([`all ${ENTRIES.length} seeded fingerprints replay (${replayed}/${ENTRIES.length}${broken.length > 0 ? ` — ${broken.join('; ')}` : ''})`, broken.length === 0]);

  const novel = await post({ intent: 'all contacts with their emails', shape: { contacts: [{ id: 'string', email: 'string' }] }, context: {} });
  checks.push([`a novel read is 400 locked (got ${novel.status} ${String(novel.body['error'])})`, novel.status === 400 && novel.body['error'] === 'locked']);

  const unknown = await post({ fingerprint: 'contacts/doesNotExist', context: {} });
  checks.push([`an unknown fingerprint is 404 cache_miss (got ${unknown.status} ${String(unknown.body['error'])})`, unknown.status === 404 && unknown.body['error'] === 'cache_miss']);

  const patch = await post({ fingerprint: ENTRIES[0]!.fingerprint, protected: false }, 'PATCH');
  checks.push([`PATCH is 403 locked (got ${patch.status})`, patch.status === 403 && patch.body['error'] === 'locked']);
  const del = await post({ fingerprint: ENTRIES[0]!.fingerprint }, 'DELETE');
  checks.push([`DELETE is 403 locked (got ${del.status})`, del.status === 403 && del.body['error'] === 'locked']);

  let mutReplayed = 0;
  for (const m of MUTATION_ENTRIES) {
    // With an empty context the entry still resolves and reaches the write
    // pipeline, which 400s on missing context: never `locked` or `cache_miss`.
    const res = await post({ fingerprint: m.fingerprint, context: {} });
    const okShape = res.status === 200 || (res.status === 400 && res.body['error'] === 'missing_context');
    if (okShape) mutReplayed += 1;
  }
  checks.push([`all ${MUTATION_ENTRIES.length} write entries resolve under lock (${mutReplayed}/${MUTATION_ENTRIES.length})`, mutReplayed === MUTATION_ENTRIES.length]);

  const write = await post({ fingerprint: taskUpsert.fingerprint, context: { id: '', title: 'Locked probe', due_date: null, deal_id: null } });
  checks.push([`a write replays by fingerprint under lock (got ${write.status})`, write.status === 200]);

  const inline = await post({ mutation: taskUpsert.mutation, context: { id: '', title: 'x', due_date: null, deal_id: null } });
  checks.push([`an inline mutation def is refused (got ${inline.status} ${String(inline.body['error'])})`, inline.status === 400 && inline.body['error'] === 'invalid_request']);

  const holes = await post({ fingerprint: taskSetDone.fingerprint, context: {} });
  const expected = (holes.body['details'] as { expected?: Record<string, { type: string }> } | undefined)?.expected;
  checks.push([
    `a write with holes is 400 missing_context carrying the full signature (got ${String(holes.body['error'])}: ${Object.keys(expected ?? {}).sort().join(',')})`,
    holes.status === 400 && holes.body['error'] === 'missing_context' && expected?.['done']?.type === 'boolean' && expected?.['id'] !== undefined,
  ]);

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
