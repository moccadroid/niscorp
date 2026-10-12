import { CAST } from '@lyra/db/seed';
import { app, asPrincipal, idFor, ok, report, server } from './world';

const meter = (): { size: number; resolved: number; evicted: number; expired: number } => {
  const m = server.identities?.meter();
  if (m === undefined) throw new Error('identity-check: the app declares no `identity` seam');
  return m;
};

const revenue = async (email: string): Promise<unknown> =>
  asPrincipal(email, '/api/studio/vex', { fingerprint: 'studio/revenue/expected', context: {} });

ok('moss holds identity for this app', server.identities !== undefined, 'the seam is declared, so the cache exists');

const before = meter().resolved;
await revenue(CAST.lumen.owner);
const afterFirst = meter().resolved;
ok('the first request resolves the principal once', afterFirst === before + 1, `${afterFirst - before} resolutions`);

for (let i = 0; i < 8; i += 1) await revenue(CAST.lumen.owner);
const afterMany = meter().resolved;
ok(
  '...and eight more requests resolve nobody again',
  afterMany === afterFirst,
  `${afterMany - afterFirst} further resolutions across 8 requests — the seam is asked per SESSION, not per request`,
);

await revenue(CAST.northrock.owner);
ok('a different principal resolves on their own first request', meter().resolved === afterMany + 1);

const roster = server.identities?.list() ?? [];
ok('the roster names who is resident', roster.length >= 2, `${roster.length} identities held`);
ok(
  '...and carries structural facts only — no roles, no scope values',
  roster.every((r) => Object.keys(r).sort().join(',') === 'lastSeen,principal,since'),
  JSON.stringify(roster[0]),
);
ok(
  '...so the roster cannot be read as a directory',
  !JSON.stringify(roster).includes('studioId') && !JSON.stringify(roster).includes('roles'),
  'enumeration is an operator capability; it is not a way to read everybody',
);

const ownerId = idFor(CAST.lumen.owner);
const truth = JSON.stringify(await revenue(CAST.lumen.owner));
ok('an identity can be dropped', server.invalidateIdentity(ownerId), 'invalidate answers whether it held one');
ok('...and dropping it twice is an answer, not an error', !server.invalidateIdentity(ownerId));

const held = meter().resolved;
const again = JSON.stringify(await revenue(CAST.lumen.owner));
ok('dropping it costs exactly one re-resolution', meter().resolved === held + 1, `${meter().resolved - held}`);
ok('...and loses no information — the answer is identical', again === truth, 'if dropping it changed an answer, it was not a cache');

ok('the cache is metered, so pressure is visible before it is fatal', typeof meter().evicted === 'number' && typeof meter().size === 'number', JSON.stringify(meter()));

await revenue(CAST.lumen.owner);
await revenue(CAST.northrock.owner);
const bothHeld = server.identities?.list().length ?? 0;
ok('two studios are resident', bothHeld >= 2, `${bothHeld} identities`);

const droppedLumen = server.invalidateTag('st_lumen');
ok('forgetting one studio forgets its people', droppedLumen > 0, `${droppedLumen} dropped`);
ok(
  '...and leaves the other studio held — an integration landing at Lumen is not North Rock’s business',
  (server.identities?.list() ?? []).length === bothHeld - droppedLumen,
  `${(server.identities?.list() ?? []).length} still resident`,
);
ok('an unknown tenant is an answer, not an error', server.invalidateTag('st_nobody') === 0);

const inputsOf = async (): Promise<Record<string, Record<string, unknown>> | undefined> =>
  app.shell?.inputs?.({ principal: null, actions: [], roles: [], identity: {}, wire: (async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' })) as never });

const withFlag = async (value: string): Promise<string> => {
  process.env['LYRA_DEV_LOGIN'] = value;
  return JSON.stringify((await inputsOf()) ?? {});
};

const off = await withFlag('off');
ok('with the dev transport off, an anonymous request gets no person rows', !off.includes('@'), off.slice(0, 90));
ok('...not one name, not one address', (JSON.parse(off) as { main?: { people?: unknown[] } }).main?.people?.length === 0, off.slice(0, 60));

const on = await withFlag('on');
ok('...and with it on, the picker still works — testing is not the thing being taken away', on.includes('@'), `${(JSON.parse(on) as { main?: { people?: unknown[] } }).main?.people?.length ?? 0} people offered`);

report('identity resolves once per session, the roster tells an operator nothing about anybody, dropping it changes no answer, and the login screen is a transport rather than a directory.');
