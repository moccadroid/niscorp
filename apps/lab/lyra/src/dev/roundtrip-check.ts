import { createServer } from '@niscorp/moss';
import type { ActionDefinition } from '@niscorp/nova';
import { buildLyra } from '@lyra/app/app';
import { COMPONENT_NAMES } from '@lyra/ui/registry';
import { tideDriver } from '@lyra/server/boot';
import { CAST } from '@lyra/db/seed';
import { app, idFor, mintToken, ok, report, runtime, server, settle, tide, treeOf } from './world';

const json = (value: unknown): string => JSON.stringify(value) ?? '';

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

const wire = json(app.actions);
const rehydrated: Record<string, ActionDefinition> = JSON.parse(wire);

ok('the catalog serialises', wire.length > 100_000, `${(wire.length / 1024).toFixed(0)} KB on the wire`);
ok('...and parses back byte-identical', json(rehydrated) === wire, 'no key reordered, no value coerced');
ok('...with every action still present', Object.keys(rehydrated).length === Object.keys(app.actions).length, `${Object.keys(rehydrated).length} actions`);

const layoutsMatch = Object.keys(app.actions).every((id) => json(rehydrated[id]?.layout) === json(app.actions[id]?.layout));
ok('...and every layout identical to the last node', layoutsMatch);

const triggersMatch = Object.keys(app.actions).every((id) => json(rehydrated[id]?.triggers) === json(app.actions[id]?.triggers));
ok('...and every trigger chain intact', triggersMatch);

const entriesWire = json(app.entries);
ok('the vex entries serialise', json(JSON.parse(entriesWire)) === entriesWire, `${(entriesWire.length / 1024).toFixed(0)} KB`);

const twin = buildLyra(
  {
    pool: runtime.pool,
    server: () => twinServer,
    tide: () => tide,
    driver: tideDriver,
    // The twin never edits an automation, so there is nothing for it to re-read.
    reloadAutomations: async () => 0,
  },
);
twin.actions = rehydrated;
if (twin.shell !== undefined) twin.shell.components = Object.fromEntries(COMPONENT_NAMES.map((name) => [name, {}]));

const twinServer = await createServer(twin, runtime);
ok('a server boots from the parsed JSON', twinServer !== undefined, 'moss verified the charter against rehydrated actions');

const PRINCIPALS: [string, string | null][] = [
  ['owner', CAST.lumen.owner],
  ['front desk', CAST.lumen.desk],
  ['instructor', CAST.lumen.instructor],
  ['member', CAST.lumen.member],
  ['anonymous', null],
];

for (const [who, email] of PRINCIPALS) {
  const id = email === null ? null : (idFor(email));
  const original = (await server.catalogOf(id)).ids;
  const twinIds = (await twinServer.catalogOf(id)).ids;
  ok(`a ${who} resolves the same catalog on both`, json([...original].sort()) === json([...twinIds].sort()), `${original.length} actions`);
}

// An instance id is minted per shell. Matched by its format, not by the
// `instanceId` key: the same id also travels as the render tree's `key`.
const stable = (tree: string): string => tree.replace(/act-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'act-·');

const openShell = async (target: typeof server, email: string | null): ReturnType<NonNullable<typeof server.shells>['session']> => {
  const shells = target.shells;
  if (shells === undefined) throw new Error('roundtrip: this server has no shells — there is nothing to compare');
  const token = email === null ? null : await mintToken(email);
  const principal = email === null ? null : (idFor(email));
  return await shells.session(token, principal);
};

// Settled before reading: a shell read on the turn it is created is mid-mount.
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

const forged = await readFrom(twinServer, CAST.lumen.owner, '/api/member/vex', {
  fingerprint: 'people/list',
  context: { q: '%', lens: 'current', studioId: 'st_northrock' },
});
ok('a forged studio still crosses nothing on the twin', !forged.includes('Omar Haddad'), 'scope survived the trip');

const refused = await readFrom(twinServer, CAST.lumen.member, '/api/member/vex', { fingerprint: 'people/list', context: { q: '%', lens: 'current', after: '', afterId: '' } });
ok('...and a member is still refused the roll', refused.startsWith('status'), refused.slice(0, 40));

report('the app survives being data: parsed from JSON, it boots, renders and answers identically.');
