// Run: pnpm --filter lyra exec tsx src/dev/identity-check.ts
//
// IDENTITY IS RESOLVED ONCE PER SESSION, NOT ONCE PER REQUEST.
//
// This is the acceptance criterion for the regression that came in with the
// memo re-key (docs/plans/lyra-identity.md, 7.1 step 6): keying the compiled
// memos by (roles + installed) is correct and bounded, but it meant deriving
// that key — and calling into the application to do it — on every single
// request. The identity seam removes that only if the request path READS a
// resolved record rather than re-asking. Nothing forces that but this check.
//
// It is asserted through moss's own meter rather than by instrumenting the app,
// because the meter is what an operator would look at: if this check can't see
// the resolution count, neither can anybody running the thing.
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

// ── one session, many requests ───────────────────────────────
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

// ── a second principal is a second session, not a second copy ──
await revenue(CAST.northrock.owner);
ok('a different principal resolves on their own first request', meter().resolved === afterMany + 1);

// ── the roster names people and leaks nothing ────────────────
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

// ── INVARIANT 3: losing it loses nothing ─────────────────────
const ownerId = idFor(CAST.lumen.owner);
const truth = JSON.stringify(await revenue(CAST.lumen.owner));
ok('an identity can be dropped', server.invalidateIdentity(ownerId), 'invalidate answers whether it held one');
ok('...and dropping it twice is an answer, not an error', !server.invalidateIdentity(ownerId));

const held = meter().resolved;
const again = JSON.stringify(await revenue(CAST.lumen.owner));
ok('dropping it costs exactly one re-resolution', meter().resolved === held + 1, `${meter().resolved - held}`);
ok('...and loses no information — the answer is identical', again === truth, 'if dropping it changed an answer, it was not a cache');

// ── the bound is real ────────────────────────────────────────
ok('the cache is metered, so pressure is visible before it is fatal', typeof meter().evicted === 'number' && typeof meter().size === 'number', JSON.stringify(meter()));

// ── THE LOGIN SCREEN IS NOT A DIRECTORY ──────────────────────
//
// The anonymous shell used to answer with every name and every email at the
// deployment, because the picker and the roster were one code path: `everyone()`
// inside `shell.inputs`. It is the class of hole the charter exists to prevent,
// sitting in the one place the charter is structurally blind to — nothing read
// through the old directory touched a table vex governs, so `acl-check`,
// `scope-check`, `visibility-check` and `reachable-check` were all incapable of
// seeing it.
//
// It survives as a TRANSPORT, on a flag, because clicking a name is worth real
// money in testing. This is the assertion that the flag actually means
// something.
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
