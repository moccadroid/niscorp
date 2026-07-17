// Server check — SERVER.md step 3a through the wire. The app is its
// MANIFEST (src/relay.ts) plus a database; createServer derives the
// rest — data layer from the seeded db, universe from the introspected
// schema, boot refusal, per-principal policies and catalogs — and answers
// real HTTP requests in-process (app.request — no port): identity from
// the Bearer token, the catalog resolved per principal, vex reads/writes
// under the principal's compiled policy, and discovery advertising only
// what the policy can touch.
import { createServer } from '@niscorp/moss';
import { relay } from '@relay/app/app';
import { devRuntime } from '../server/runtime';
import { mintToken } from '../server/users';

const checks: [string, boolean][] = [];

type Json = Record<string, unknown>;

const main = async (): Promise<void> => {
  const dev = await devRuntime();
  const app = await createServer(relay, dev);
  const rt = { db: dev.db };

  const request = async (path: string, opts: { as?: string; token?: string; body?: unknown } = {}): Promise<{ status: number; body: Json }> => {
    const token = opts.token ?? (opts.as !== undefined ? mintToken(opts.as) : null);
    const res = await app.request(path, {
      method: opts.body !== undefined ? 'POST' : 'GET',
      headers: {
        ...(token !== null && token !== undefined ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    return { status: res.status, body: (await res.json()) as Json };
  };

  // ── identity: bad token → 401; no token → the anonymous principal ──
  const bad = await request('/catalog', { token: 'garbage' });
  checks.push([`an invalid token is refused (got ${bad.status} ${String(bad.body['error'])})`, bad.status === 401 && bad.body['error'] === 'invalid_token']);

  const anon = await request('/catalog');
  const anonActions = anon.body['actions'] as string[];
  checks.push([`anonymous catalog = the lock screen alone (got ${anonActions?.join(', ')})`, anon.status === 200 && anonActions?.length === 1 && anonActions[0] === 'auth.login']);

  // ── the catalog is per principal; the hash is the version token ──
  const jordan = await request('/catalog', { as: 'jordan' });
  const alex = await request('/catalog', { as: 'alex' });
  const jordanActions = jordan.body['actions'] as string[];
  const alexActions = alex.body['actions'] as string[];
  checks.push(['viewer catalog has the deal screen but NOT the deal form', jordanActions.includes('crm.deals') && !jordanActions.includes('crm.deal.form')]);
  checks.push(['sales catalog has the deal form', alexActions.includes('crm.deal.form')]);
  checks.push([`different principals, different version tokens (${String(jordan.body['hash'])} vs ${String(alex.body['hash'])})`, jordan.body['hash'] !== alex.body['hash']]);
  const jordanAgain = await request('/catalog', { as: 'jordan' });
  checks.push(['the same principal gets the same token (equal hash, equal application)', jordanAgain.body['hash'] === jordan.body['hash']]);

  // ── vex under the principal's policy, through the server surface ──
  const openDeal = (await rt.db.query("SELECT id FROM deals WHERE status='open' LIMIT 1")).rows[0] as { id: string };

  const vWon = await request('/api/deals/vex', { as: 'jordan', body: { fingerprint: 'deals/markWon', context: { deal_id: openDeal.id } } });
  checks.push([`viewer's markWon dies at the server (got ${vWon.status} ${String(vWon.body['error'])})`, vWon.status === 400 && vWon.body['error'] === 'scope_denied']);

  const aRead = await request('/api/deals/vex', { body: { fingerprint: 'deals/list', context: { q: ' ' } } });
  checks.push([`anonymous cannot read deals (got ${aRead.status} ${String(aRead.body['error'])})`, aRead.status === 400 && aRead.body['error'] === 'scope_denied']);

  const sWon = await request('/api/deals/vex', { as: 'alex', body: { fingerprint: 'deals/markWon', context: { deal_id: openDeal.id } } });
  checks.push([`sales's markWon lands (got ${sWon.status})`, sWon.status === 200]);
  const won = (await rt.db.query('SELECT status FROM deals WHERE id = $1', [openDeal.id])).rows[0] as { status: string };
  checks.push([`the deal is actually won (got ${won.status})`, won.status === 'won']);

  const sDel = await request('/api/deals/vex', { as: 'alex', body: { fingerprint: 'deals/delete', context: { id: openDeal.id } } });
  checks.push([`sales's delete is refused (got ${sDel.status} ${String(sDel.body['error'])})`, sDel.status === 400 && sDel.body['error'] === 'scope_denied']);
  const mDel = await request('/api/deals/vex', { as: 'sam', body: { fingerprint: 'deals/delete', context: { id: openDeal.id } } });
  checks.push([`admin's delete lands (got ${mDel.status})`, mDel.status === 200]);

  // ── discovery is per principal: what you can't touch isn't advertised ──
  const anonDisc = await request('/api/deals/vex');
  const alexDisc = await request('/api/deals/vex', { as: 'alex' });
  const jordanDisc = await request('/api/deals/vex', { as: 'jordan' });
  const fps = (d: Json): { kind: string }[] => d['fingerprints'] as { kind: string }[];
  const ents = (d: Json): unknown[] => d['entities'] as unknown[];
  checks.push([`anonymous discovery advertises nothing (got ${fps(anonDisc.body).length} entries, ${ents(anonDisc.body).length} entities)`, fps(anonDisc.body).length === 0 && ents(anonDisc.body).length === 0]);
  checks.push([`viewer discovery lists reads but no mutations (got ${fps(jordanDisc.body).length}, mutations ${fps(jordanDisc.body).filter((f) => f.kind === 'mutation').length})`, fps(jordanDisc.body).length > 0 && fps(jordanDisc.body).every((f) => f.kind === 'query')]);
  checks.push(['sales discovery lists mutations too', fps(alexDisc.body).some((f) => f.kind === 'mutation')]);
  const alexMutations = fps(alexDisc.body).filter((f) => f.kind === 'mutation') as { fingerprint?: string }[];
  checks.push(["sales's discovery does NOT advertise deals/delete (no delete phase)", !alexMutations.some((f) => f.fingerprint === 'deals/delete')]);
  const samDisc = await request('/api/deals/vex', { as: 'sam' });
  const samMutations = fps(samDisc.body).filter((f) => f.kind === 'mutation') as { fingerprint?: string }[];
  checks.push(["admin's discovery does advertise deals/delete", samMutations.some((f) => f.fingerprint === 'deals/delete')]);

  // ── report ──
  let failed = 0;
  for (const [label, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}`);
  }
  if (failed > 0) {
    console.log(`\nFAIL — ${failed} check(s).`);
    process.exit(1);
  }
  console.log('\nOK — the app server serves existence: per-principal catalog, policy-scoped vex, honest discovery.');
  process.exit(0);
};

void main();
