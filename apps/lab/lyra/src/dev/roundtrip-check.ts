// Round-trip check — the app survives being data.
//
// The census says the application surface serialises with nothing lost. That is
// a claim about `JSON.stringify`, and a claim is not a check. This one takes the
// running app's artifacts, sends them through JSON, builds a SECOND server from
// what came back, and asserts the two are indistinguishable: same catalog, same
// rendered trees, same rows over the wire.
//
// Both servers share one database, so the only variable is the manifest. If a
// tree differs, the artifacts lost something on the way through.
//
// Run: pnpm --filter lyra exec tsx src/dev/roundtrip-check.ts
import { createServer, resolveCatalog } from '@niscorp/moss';
import type { ActionDefinition } from '@niscorp/nova';
import { buildLyra } from '@lyra/app/app';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
import { tideDriver } from '@lyra/server/boot';
import { CAST } from '@lyra/db/seed';
import { app, idFor, mintToken, ok, report, runtime, server, settle, tide, treeOf } from './world';

const json = (value: unknown): string => JSON.stringify(value) ?? '';

// ── 1. nothing in the surface refuses to serialise ───────────
//
// A function survives `JSON.stringify` as `undefined` and vanishes silently, so
// the count has to be taken before the round trip rather than inferred after.
const functionsIn = (value: unknown, path: string, found: string[]): string[] => {
  if (typeof value === 'function') found.push(path);
  else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) functionsIn(child, `${path}.${key}`, found);
  }
  return found;
};

const surface = { actions: app.actions, entries: app.entries, charter: app.charter, behaviors: app.behaviors, resources: app.resources };
const holes = functionsIn(surface, 'app', []);
const counted = `${Object.keys(app.actions).length} actions, ${(app.entries ?? []).length} entries, charter, behaviors`;
ok('the application surface holds no functions', holes.length === 0, holes.length === 0 ? `${counted} — all plain data` : holes.slice(0, 3).join(', '));

// ── 2. it survives the trip ──────────────────────────────────
const wire = json(app.actions);
const rehydrated: Record<string, ActionDefinition> = JSON.parse(wire);

ok('the catalog serialises', wire.length > 100_000, `${(wire.length / 1024).toFixed(0)} KB on the wire`);
ok('...and parses back byte-identical', json(rehydrated) === wire, 'no key reordered, no value coerced');
ok('...with every action still present', Object.keys(rehydrated).length === Object.keys(app.actions).length, `${Object.keys(rehydrated).length} actions`);

// A layout is the deepest thing in an action, so it is the first casualty of a
// lossy trip. Compare the whole tree, not the id.
const layoutsMatch = Object.keys(app.actions).every((id) => json(rehydrated[id]?.layout) === json(app.actions[id]?.layout));
ok('...and every layout identical to the last node', layoutsMatch);

const triggersMatch = Object.keys(app.actions).every((id) => json(rehydrated[id]?.triggers) === json(app.actions[id]?.triggers));
ok('...and every trigger chain intact', triggersMatch);

const entriesWire = json(app.entries);
ok('the vex entries serialise', json(JSON.parse(entriesWire)) === entriesWire, `${(entriesWire.length / 1024).toFixed(0)} KB`);

// ── 3. a server built from the parsed JSON ───────────────────
//
// The real test. Same database, same directory, same everything — the only
// difference is that this manifest's actions came out of a string.
// THE SAME directory object the real app was built from, imported rather than
// re-typed. A second literal here drifted the moment the directory grew — it
// went four members stale (locale, phrases, locales, greeting) and the twin
// stopped booting, which surfaced as a TypeError deep in a shell build rather
// than as the one-line type error it always was.
const twin = buildLyra(
  {
    pool: runtime.pool,
    server: () => twinServer,
    // The SAME tide the original holds. A twin with no automations engine would
    // render the automations screen differently for a reason that has nothing to
    // do with the round trip — that would be testing the harness.
    tide: () => tide,
    driver: tideDriver,
    // The twin renders and answers; it never edits an automation, so there is
    // nothing for it to re-read. Stated rather than omitted, because `deps` is
    // the other literal here that drifts when the real one grows.
    reloadAutomations: async () => 0,
  },
);
twin.actions = rehydrated;
if (twin.shell !== undefined) twin.shell.components = Object.fromEntries(COMPONENT_NAMES.map((name) => [name, {}]));

// moss verifies the charter against the shipped actions and refuses to boot an
// incoherent one — so reaching the next line is itself an assertion.
const twinServer = await createServer(twin, runtime);
ok('a server boots from the parsed JSON', twinServer !== undefined, 'moss verified the charter against rehydrated actions');

// ── 4. the two resolve the same application per principal ────
const PRINCIPALS: [string, string | null][] = [
  ['owner', CAST.lumen.owner],
  ['front desk', CAST.lumen.desk],
  ['instructor', CAST.lumen.instructor],
  ['member', CAST.lumen.member],
  ['anonymous', null],
];

for (const [who, email] of PRINCIPALS) {
  const id = email === null ? null : (idFor(email));
  const original = resolveCatalog(app, id).ids;
  const twinIds = resolveCatalog(twin, id).ids;
  ok(`a ${who} resolves the same catalog on both`, json([...original].sort()) === json([...twinIds].sort()), `${original.length} actions`);
}

// ── 5. and RENDER the same thing ─────────────────────────────
//
// The one that matters: a catalog can match while a layout renders differently.
//
// An instance id is minted per shell, so it differs by construction and is
// normalised away. Matched by its FORMAT rather than by key, because the same
// id also travels as the render tree's `key` — keying on `instanceId` alone
// leaves those behind and the comparison fails for a reason that is not a
// finding.
const stable = (tree: string): string => tree.replace(/act-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'act-·');

const openShell = async (target: typeof server, email: string | null): ReturnType<NonNullable<typeof server.shells>['session']> => {
  // A server with no shells cannot be compared to one that has them — that is a
  // broken harness, not an empty result, so it says so rather than returning
  // undefined and failing later as a tree that renders nothing.
  const shells = target.shells;
  if (shells === undefined) throw new Error('roundtrip: this server has no shells — there is nothing to compare');
  const token = email === null ? null : await mintToken(email);
  const principal = email === null ? null : (idFor(email));
  return await shells.session(token, principal);
};

// Both shells are opened, THEN settled, THEN read. Reading on the turn a shell
// is created captures it mid-mount, so the comparison would be of two blank
// trees agreeing about nothing.
for (const [who, email] of PRINCIPALS) {
  const a = await openShell(server, email);
  const b = await openShell(twinServer, email);
  await settle(18);
  const treeA = a === undefined ? '' : treeOf(a.shell);
  const treeB = b === undefined ? '' : treeOf(b.shell);
  const same = treeA !== '' && stable(treeA) === stable(treeB);
  ok(
    `a ${who}'s shell renders identically from JSON`,
    same,
    same ? `${treeA.length.toLocaleString()} chars of tree, identical once instance ids are normalised` : `original ${treeA.length}, twin ${treeB.length}`,
  );
}

// ── 5b. …on every screen, not just the one they land on ─────
//
// The comparison above only reaches what boots: the chrome and the landing
// surface, two actions of the thirty-eight. Corrupting anything a principal has
// to NAVIGATE to would sail straight past it. So both shells are driven through
// the same destinations and compared at each stop.
const OWNER = CAST.lumen.owner;
const ownerA = await openShell(server, OWNER);
const ownerB = await openShell(twinServer, OWNER);
await settle(18);

const DESTINATIONS = ['people.list', 'leads.list', 'staff.list', 'plans.list', 'timetable.list', 'schedule.timetable', 'reports.overview', 'studio.settings', 'automations.list'];
let walked = 0;
let drift = '';
for (const destination of DESTINATIONS) {
  ownerA?.shell.dispatch({ type: 'ui:click', ref: 'nav', payload: destination });
  ownerB?.shell.dispatch({ type: 'ui:click', ref: 'nav', payload: destination });
  await settle(18);
  const treeA = ownerA === undefined ? '' : treeOf(ownerA.shell);
  const treeB = ownerB === undefined ? '' : treeOf(ownerB.shell);
  if (treeA !== '' && stable(treeA) === stable(treeB)) walked += 1;
  else if (drift === '') drift = `${destination}: ${treeA.length} vs ${treeB.length}`;
}
ok(`every screen an owner can open renders identically`, walked === DESTINATIONS.length, walked === DESTINATIONS.length ? `${walked} destinations walked on both shells` : drift);

// ── 6. and answer the same rows ──────────────────────────────
//
// The entries round-tripped too, so a read replayed against the twin has to
// return what the original does — same fingerprint, same policy, same rows.
const readFrom = async (target: typeof server, email: string, path: string, body: unknown): Promise<string> => {
  const token = await mintToken(email);
  const response = await target.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(token)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return `status ${response.status}`;
  const payload: { result?: unknown } = await response.json();
  return json(payload.result);
};

const READS: [string, string, string, unknown][] = [
  ['the roll', CAST.lumen.owner, '/api/member/vex', { fingerprint: 'people/list', context: { q: '%', lens: 'current', after: '', afterId: '' } }],
  ["a member's own card", CAST.lumen.member, '/api/me/vex', { fingerprint: 'me/card', context: {} }],
  ['the price list', CAST.lumen.owner, '/api/studio/vex', { fingerprint: 'offerings/list', context: {} }],
];

for (const [what, email, path, body] of READS) {
  const a = await readFrom(server, email, path, body);
  const b = await readFrom(twinServer, email, path, body);
  ok(`${what} reads the same from the rehydrated server`, a === b && !a.startsWith('status'), a === b ? `${a.length} chars of rows` : `original ${a.slice(0, 40)} vs twin ${b.slice(0, 40)}`);
}

// ── 7. and the boundary is still the engine's ────────────────
//
// A round trip that quietly dropped a scope rule would still render and still
// read — it would just read too much. So the refusal is asserted on the twin.
const forged = await readFrom(twinServer, CAST.lumen.owner, '/api/member/vex', {
  fingerprint: 'people/list',
  context: { q: '%', lens: 'current', studioId: 'st_northrock' },
});
ok('a forged studio still crosses nothing on the twin', !forged.includes('Omar Haddad'), 'scope survived the trip');

const refused = await readFrom(twinServer, CAST.lumen.member, '/api/member/vex', { fingerprint: 'people/list', context: { q: '%', lens: 'current', after: '', afterId: '' } });
ok('...and a member is still refused the roll', refused.startsWith('status'), refused.slice(0, 40));

report('the app survives being data: parsed from JSON, it boots, renders and answers identically.');
