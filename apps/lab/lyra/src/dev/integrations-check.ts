// AN APPLICATION THAT ARRIVES FROM SOMEWHERE ELSE.
//
// The whole path, end to end, against a real second service on a real port:
// announce → fetch → intake → approve → the actions are part of the app →
// a proxied call reaches the other service carrying an identity the browser
// never touched → uninstall takes it away again.
//
// What it is really testing is that the two systems share NOTHING but a wire.
// `lyra-integrations` imports no Lyra code, has no row in this database, and
// keys its records on identifiers handed over in a header.
//
// Run: pnpm --filter lyra exec tsx src/dev/integrations-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { serve as listen } from '@hono/node-server';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { mintToken, personByEmail } from '@lyra/server/users';
import { app, login, ok, report, runtime, server, settle, treeOf } from './world';

// REGISTRATION LIVES BEHIND THE OPERATOR SEAM, keyed and principal-less: it is a
// platform act, not a tenant one. The key is set here rather than in the
// environment because the seam reads it per request.
const KEY = 'lab-operator-key';
runtime.operatorKey = KEY;

// A PORT OF ITS OWN, so this check cannot fight the service somebody is
// running to look at. They used to share 8799: every suite run killed the
// development instance, and the screen then said 'the service did not answer
// with a bundle' — an accurate message about a problem the checks had caused.
const PORT = 8798;
// THE VERIFY KEY CROSSES, NOTHING SECRET DOES. The service trusts identity
// assertions signed by the deployment, so it needs the deployment's PUBLIC
// key — served openly, set here the way an operator sets an env var.
const verifyKey = (await (await server.request('/api/integrations/verify-key')).json()) as { key: string };
process.env['LYRA_VERIFY_KEY'] = verifyKey.key;
const service = startIntegrations(PORT);
const idsFor = (email: string): readonly string[] => resolveCatalog(app, personByEmail(email)?.id ?? null).ids;

// Lyra itself on a real port, stood up when the promote flow needs it: the
// service's keyed notify is an HTTP call INTO lyra, and an in-process hono has
// no address. Closed with the same Windows care as the service's own socket.
let lyraHttp: ReturnType<typeof listen> | undefined;
const closeLyraHttp = (): Promise<void> =>
  new Promise<void>((resolve) => {
    if (lyraHttp === undefined) return resolve();
    (lyraHttp as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    lyraHttp.close(() => setTimeout(resolve, 25));
  });

// A RAW CALL, not `asPrincipal`. That helper unwraps vex's `{ result }`
// envelope, and an integration answers with a bare body — it is not a vex
// surface and has no reason to wear vex's shape.
const asIntegration = async (email: string, path: string, body: unknown): Promise<unknown> => {
  const token = mintToken(email);
  const response = await server.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${String(token)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { status: response.status };
  return response.json();
};

const post = async (path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const response = await server.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-operator-key': KEY },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

try {
  // ── the service is up and holds data we do not ───────────────
  const selftest = await fetch(`http://127.0.0.1:${PORT}/belts/_selftest`).then((r) => r.json() as Promise<Record<string, number>>);
  ok('the integration is a separate service with its own records', (selftest['north'] ?? 0) > 0, `${selftest['north']} belts, none of them in our database`);

  const ours = await runtime.db.query("SELECT count(*) n FROM information_schema.tables WHERE table_name LIKE '%belt%'");
  ok('...and no table of ours holds a belt', Number((ours.rows[0] as { n: string }).n) === 0, 'a discipline pack with no migration');

  // ── announce ─────────────────────────────────────────────────
  const registered = await post('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` });
  ok('announcing registers it', registered.status === 200, JSON.stringify({ ...registered.json, key: '…' }));
  ok('...and it lands PENDING, holding nothing', registered.json['status'] === 'pending', String(registered.json['status']));
  ok('...with its actions recorded', registered.json['actions'] === 4, String(registered.json['actions']));

  // THE KEY, MINTED AND SHOWN ONCE. Registration is a granting ceremony — the
  // deployment issues the integration its credential; the row keeps the hash.
  const key = String(registered.json['key'] ?? '');
  ok('registration mints the integration key', key.startsWith('ik_'), `${key.slice(0, 6)}… — the deployment issues, never receives`);

  const again = await post('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` });
  ok('...shown exactly once — a re-import repeats nothing', again.json['key'] === undefined, 'the plaintext is not stored, so it cannot come back');

  // Nothing it ships is served yet. Asking is not getting.
  ok('a pending integration is in nobody’s application', !idsFor(CAST.northrock.owner).some((id) => id.startsWith('ext.')), 'approval is what makes a grant real');

  // ...and neither is its key: minted at registration, inert until approval.
  const early = await server.request('/api/automation/vex', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'x-nisc-acts-for': 'st_northrock', 'content-type': 'application/json' },
    body: JSON.stringify({ fingerprint: 'automation/notify', context: {} }),
  });
  ok('...and its key opens nothing yet', early.status === 401, String(early.status));

  // ── approve ──────────────────────────────────────────────────
  const approved = await post('/operator/integrations/belts/approve', {});
  ok('approving grants what it asked for', approved.status === 200, JSON.stringify(approved.json));

  // ── installed for one studio, not the other ──────────────────
  //
  // THE ASSERTION THIS CHECK EXISTS FOR. The charter grants `ext.desk.*` once,
  // for the whole deployment. Without the installation filter, North Rock
  // buying a belt system would put it on Lumen's front desk too.
  //
  // INSTALLED THROUGH THE STORE, in a real shell, because that is the path an
  // owner has. This used to be an SQL insert plus a manual directory reload —
  // which proved the filter and silently skipped the button, and the button
  // was broken: nothing behind it reloaded the directory or dropped the
  // catalog memos, so a studio could buy a pack and keep a menu that had
  // never heard of it.
  const owner = login(CAST.northrock.owner);
  await settle(10);
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  ok('the store lists what the operator approved', treeOf(owner).includes('Available'), 'belts, on sale');

  // THE TILE SPEAKS THE BUNDLE'S WORDS — meta from intake, and the derived
  // "Adds …" sentence saying what appears where BEFORE anything is installed.
  ok('...as a tile with the bundle’s meta', treeOf(owner).includes('Rank tracking for grappling gyms'), 'title and tagline, not an id');
  ok('...that says what appears where', treeOf(owner).includes('Adds'), treeOf(owner).match(/Adds[^.]*\./)?.[0] ?? '(no placement sentence)');

  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'belts' } });
  await settle(18);
  ok('...and installing flips it on', treeOf(owner).includes('On'), 'one row, written through the owner’s own policy');

  const northrock = idsFor(CAST.northrock.owner);
  const lumen = idsFor(CAST.lumen.owner);
  ok('the studio that installed it has the screens', northrock.includes('ext.desk.belts.roster'), northrock.filter((i) => i.startsWith('ext.')).join(', '));
  ok('...and the studio that did not, does not', !lumen.some((id) => id.startsWith('ext.')), 'one glob, two tenants, different applications');

  const nrMember = idsFor(CAST.northrock.member);
  ok('a member at the installed studio gets the member half', nrMember.includes('ext.member.belts.mine'), nrMember.filter((i) => i.startsWith('ext.')).join(', '));
  ok('...and a member elsewhere does not', !idsFor(CAST.lumen.member).some((id) => id.startsWith('ext.')));

  // ── the proxy carries identity the caller cannot forge ───────
  const mine = await asIntegration(CAST.northrock.member, '/integrations/belts/mine', {});
  ok('a proxied call reaches the other service', typeof (mine as { belt?: unknown }).belt === 'string', JSON.stringify(mine));
  ok('...and it answers about the RIGHT person', (mine as { belt?: string }).belt === 'Purple', `${(mine as { belt?: string }).belt} — keyed on a header the browser never set`);

  // A crafted body naming somebody else changes nothing: identity is in the
  // header, put there by moss from the same resolver vex uses for `$scope`.
  const forged = await asIntegration(CAST.northrock.member, '/integrations/belts/mine', { membershipId: 'mb_nina', studioId: 'st_lumen' });
  ok('a forged body does not move the answer', JSON.stringify(forged) === JSON.stringify(mine), 'the body is not where identity comes from');

  // The roster is scoped by the studio header, so the other studio's desk
  // cannot see it even if it could reach it.
  const roster = (await asIntegration(CAST.northrock.owner, '/integrations/belts/roster', {})) as unknown[];
  ok('the roster is the installing studio’s own', Array.isArray(roster) && roster.length === selftest['north'], `${Array.isArray(roster) ? roster.length : -1} rows`);

  const refused = await server.request('/integrations/belts/roster', { method: 'POST', body: '{}' });
  ok('...and anonymous gets nothing', refused.status === 401, String(refused.status));

  // ── THE INTEGRATION ACTS AS ITSELF ───────────────────────────
  //
  // The other direction: no person is driving — a webhook landed, a sync ran —
  // and the integration presents its minted key, naming who it acts for. Moss
  // resolves that to the studio's integration actor, whose charter rung is the
  // whole bound on what the key can do. From the engine's side this is just
  // another principal: same compiled policy, same stamped scope, no privileged
  // path around vex.
  const asKey = async (actsFor: string, fingerprint: string, context: unknown, withKey: string = key): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await server.request('/api/automation/vex', {
      method: 'POST',
      headers: { Authorization: `Bearer ${withKey}`, 'x-nisc-acts-for': actsFor, 'content-type': 'application/json' },
      body: JSON.stringify({ fingerprint, context }),
    });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  };

  const omar = personByEmail(CAST.northrock.member);
  const noted = await asKey('st_northrock', 'automation/notify', { personId: omar?.id ?? '', kind: 'integration', subject: 'Graded', body: 'Omar holds Purple.' });
  ok('a keyed mutation lands', noted.status === 200, JSON.stringify(noted.body).slice(0, 80));

  const landed = await runtime.db.query("SELECT studio_id FROM notifications WHERE subject = 'Graded'");
  ok('...stamped with the studio the KEY acts for', (landed.rows[0] as { studio_id?: string } | undefined)?.studio_id === 'st_northrock', 'scope came from the actor, not the request');

  // The rung is the bound. A membership write is a grant this rung was never
  // given, so the same key replaying a real fingerprint is refused by the same
  // engine that refuses a person.
  const overreach = await asKey('st_northrock', 'automation/lapse-trial', { membershipId: 'mb_omar' });
  ok('...and a fingerprint outside its rung is refused', overreach.status >= 400, `${overreach.status} — the charter bounds unattended code too`);

  // Acting for a studio that never installed it: no install, no actor, and the
  // door does not open — tenancy enforced before any policy is even compiled.
  const elsewhere = await asKey('st_lumen', 'automation/notify', { personId: '', kind: 'integration', subject: 'x', body: '' });
  ok('...and a studio without the install has no actor for it', elsewhere.status === 403, String(elsewhere.status));

  const gibberish = await asKey('st_northrock', 'automation/notify', {}, 'ik_0000000000000000000000000000000000000000000000000000000000000000');
  ok('...and a key nobody minted resolves to nobody', gibberish.status === 401, String(gibberish.status));

  // ── PLACEMENT: the pack's screens live with their domain ─────
  //
  // No Add-ons ghetto. The bundle declared `hub.people` for the roster, intake
  // validated it, and `nav.context` folds it into the People TAB ROW beside
  // lyra's own screens — for the studio that bought it and nobody else. Add-ons
  // stays a store.
  //
  // The nav payload is the area's LANDING screen, not the area: there is no hub
  // page to arrive at, so this is exactly what a tap on People sends.
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
  await settle(14);
  ok('a placed screen joins its domain’s tabs', treeOf(owner).includes('Belts'), 'People: Members, Enquiries, Staff — and Belts, placed by the bundle');

  // ── THE ROSTER RENDERS NAMES, and that is the payoff ─────────
  //
  // Two services, one screen: the roll from Lyra, the belts from the pack,
  // JOINED in the action — so the desk reads a person, never an identifier.
  // The id-riddled version of this screen fetched the roll and never used it.
  // Opened from the TAB ROW, exactly as a hand would — `go` was the hub
  // screen's link ref, and there is no hub screen. That the ref vanished and
  // three assertions below still passed is worth naming: the roster never
  // mounted, and People's own roll happens to carry the same names, so the
  // join assertions read a screen that was not under test.
  // A tab dispatches its whole OPTION, not the bare value — that is what lets
  // a filter's slices carry their own parameters. See `Tabs` in controls.tsx.
  owner.dispatch({ type: 'ui:click', ref: 'navLeaf', payload: { value: 'ext.desk.belts.roster', label: 'Belts' } });
  await settle(16);
  const tree = treeOf(owner);
  ok('an integration screen mounts in a real shell', tree.includes('Who holds what, and who is due'), 'authored in another repository');
  ok('...filled from the integration', tree.includes('Purple'), 'a belt, from a service with no row in this database');
  // The tree snapshot includes component PROPS, and the rows prop rightly
  // carries membership ids — ids are for wires. What must hold is that the
  // NAME field is a name for every joined row, not an identifier.
  ok('...named from Lyra, in the same layout', tree.includes('Omar Haddad') && tree.includes('Nina Vogel') && tree.includes('Ruben Marek'), 'the join the first version only claimed');
  ok('...every row, not just one', !/person_name[^,}]*mb_/.test(tree), 'no row fell back to its identifier');

  // ── THE PANEL RIDES THE MEMBER RECORD ────────────────────────
  //
  // The attachment declaration, lived: open Omar, and the pack's Belt panel is
  // one tap away — handed exactly what the host screen offers, showing rank
  // and history with no name of its own, because the record on screen already
  // says who this is. Promote writes to the pack's storage AND acts as the
  // pack itself: its key carries the news into Lyra's notifications. For that
  // second hop the service needs Lyra's address and its own key — the two
  // lines an operator puts in its environment, set here the same way.
  lyraHttp = listen({ fetch: server.fetch, port: 8797 });
  process.env['LYRA_BASE'] = 'http://127.0.0.1:8797';
  process.env['BELTS_KEY'] = key;

  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'open', payload: { membership_id: 'mb_omar' } });
  await settle(16);
  ok('the member record offers the pack’s panel', treeOf(owner).includes('Belt'), 'the riders’ strip, derived per studio');
  ok('...wearing the pack’s preview — the belt, stripes and all', treeOf(owner).includes('Purple — 2nd stripe · since'), 'display atoms over the session’s own wire');

  owner.dispatch({ type: 'ui:click', ref: 'openAttachment', payload: { action: 'ext.desk.belts.panel' } });
  await settle(16);
  const panel = treeOf(owner);
  ok('the panel opens with the member’s belt', panel.includes('Purple — 2nd stripe'), 'belt and stripes, from what the host offered');
  ok('...and their history', panel.includes('2022-03-19'), 'the pack’s own rows');

  // EVERY VERB ASKS FIRST — the pack pushes Lyra's own `confirm` sheet and
  // does nothing until its channel answers. Cancelling is a no-op, which is
  // the property a confirmation exists for.
  owner.dispatch({ type: 'ui:click', ref: 'stripe', payload: {} });
  await settle(14);
  ok('Add stripe asks before it acts', treeOf(owner).includes('Add a stripe?'), 'Lyra’s confirm sheet, pushed by the pack');
  owner.dispatch({ type: 'ui:click', ref: 'cancel', payload: {} });
  await settle(14);
  ok('...and cancel changes nothing', treeOf(owner).includes('Purple — 2nd stripe'), 'a mistake costs a click, not a correction');

  // A STRIPE IS AN ADVANCEMENT, not a promotion: the belt stays, the bar
  // gains tape, and the studio's inbox hears about it the same keyed way.
  owner.dispatch({ type: 'ui:click', ref: 'stripe', payload: {} });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'confirm', payload: {} });
  await settle(20);
  ok('Add stripe advances the bar', treeOf(owner).includes('Purple — 3rd stripe'), 'same belt, more tape');

  const striped = await runtime.db.query("SELECT subject FROM notifications WHERE subject LIKE '%3rd stripe%'");
  ok('...and Lyra’s inbox heard the advancement', String((striped.rows[0] as { subject?: string } | undefined)?.subject ?? '') === 'Omar Haddad earned their 3rd stripe on Purple.', String((striped.rows[0] as { subject?: string } | undefined)?.subject ?? '(nothing)'));

  owner.dispatch({ type: 'ui:click', ref: 'promote', payload: {} });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'confirm', payload: {} });
  await settle(20);
  ok('Promote advances the belt — and RESETS the bar', treeOf(owner).includes('Brown') && !treeOf(owner).includes('Brown — '), 'the stripes belonged to the old belt');

  const heard = await runtime.db.query("SELECT studio_id, subject FROM notifications WHERE subject LIKE '%promoted to Brown%'");
  const note = heard.rows[0] as { studio_id?: string; subject?: string } | undefined;
  ok('...and Lyra’s inbox heard about it BY NAME', note?.subject === 'Omar Haddad was promoted to Brown.', note?.subject ?? '(nothing landed)');
  ok('...through the pack’s own key, stamped to the studio', note?.studio_id === 'st_northrock', 'the first real consumer of an integration key');

  // ── EVERY EDIT IS REVERSIBLE: the ledger is the undo stack ───
  //
  // Undo pops the newest event — the Brown promotion — and the record becomes
  // whatever the history then says: Purple with the third stripe back on.
  // Not a special case per verb; one winding-back for all of them, announced
  // to the inbox like the edit was.
  owner.dispatch({ type: 'ui:click', ref: 'undo', payload: {} });
  await settle(14);
  ok('Undo asks too', treeOf(owner).includes('Undo the last change?'), 'a correction is still an edit');
  owner.dispatch({ type: 'ui:click', ref: 'confirm', payload: {} });
  await settle(20);
  ok('...and winds the record back one step', treeOf(owner).includes('Purple — 3rd stripe'), 'the promotion came off; the stripes it reset came back');

  const corrected = await runtime.db.query("SELECT subject FROM notifications WHERE subject LIKE 'Correction:%'");
  ok('...announced as a correction', String((corrected.rows[0] as { subject?: string } | undefined)?.subject ?? '') === 'Correction: Omar Haddad is back to Purple — 3rd stripe.', String((corrected.rows[0] as { subject?: string } | undefined)?.subject ?? '(nothing)'));

  // ── the wall at four, and the white-belt floor ───────────────
  const fourth = await asIntegration(CAST.northrock.owner, '/integrations/belts/stripe', { membershipId: 'mb_ruben' });
  ok('a fourth stripe fits', (fourth as { stripes?: number }).stripes === 4, 'the last piece of tape');
  const fifth = await asIntegration(CAST.northrock.owner, '/integrations/belts/stripe', { membershipId: 'mb_ruben' });
  ok('...and there is no fifth', (fifth as { status?: number }).status === 400, 'four is the wall; the next step is a promotion');

  const fresh = await asIntegration('hana.oksana@example.com', '/integrations/belts/mine', {});
  ok('there is no unranked — a new member IS a white belt', (fresh as { belt?: string }).belt === 'White', JSON.stringify(fresh).slice(0, 60));

  // ── THE SETTINGS DOOR, on the tile and nowhere else ──────────
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  ok('an installed tile offers Settings', treeOf(owner).includes('Settings'), 'declared in the bundle, opened by the store');

  owner.dispatch({ type: 'ui:click', ref: 'openSettings', payload: { settings_action: 'ext.desk.belts.settings' } });
  await settle(16);
  ok('the pack’s settings open from the store', treeOf(owner).includes('The ranks this pack grades through'), 'configuration, not a workspace');

  owner.dispatch({ type: 'ui:model', ref: 'newRank', payload: 'Coral' });
  owner.dispatch({ type: 'ui:click', ref: 'add', payload: {} });
  await settle(16);
  ok('...and edit the pack’s OWN configuration', treeOf(owner).includes('Coral'), 'a rank added to rows Lyra does not have');

  // ── the toggle, both directions, through the button ──────────
  //
  // Uninstall leaves the row (enabled=false — what a studio bought is a fact
  // worth keeping), which makes the SECOND install an update where the first
  // was an insert. The button has to survive that round trip, because a real
  // owner will make it.
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'uninstall', payload: { integration_id: 'belts' } });
  await settle(18);
  ok('uninstalling takes the screens away', !idsFor(CAST.northrock.owner).some((id) => id.startsWith('ext.')), 'the row stays, disabled; the studio stopped paying');

  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'belts' } });
  await settle(18);
  ok('...and installing AGAIN works — the row it left behind is re-enabled', idsFor(CAST.northrock.owner).includes('ext.desk.belts.roster'), 'an update where the first install was an insert');

  owner.dispatch({ type: 'ui:click', ref: 'uninstall', payload: { integration_id: 'belts' } });
  await settle(18);
  ok('...and off again, for the assertions below', !idsFor(CAST.northrock.owner).some((id) => id.startsWith('ext.')));

  const afterRemoval = await asIntegration(CAST.northrock.owner, '/integrations/belts/roster', {});
  ok('...and the proxy stops forwarding', (afterRemoval as { status?: number }).status === 404, JSON.stringify(afterRemoval));

  // The actor IS the install: the key survives the uninstall, but there is
  // nobody left for it to act as at this studio.
  const orphaned = await asKey('st_northrock', 'automation/notify', { personId: '', kind: 'integration', subject: 'x', body: '' });
  ok('...and the key lost its actor with the install', orphaned.status === 403, String(orphaned.status));

  // ── a bad bundle is refused whole ────────────────────────────
  //
  // Not a partial import and not a broken app: the previous rows keep serving.
  const bad = await post('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/nope` });
  ok('a bundle that cannot be fetched is refused', bad.status === 502, String(bad.status));
  ok('...and the app is still standing', idsFor(CAST.northrock.owner).length > 0, 'a refusal is not an outage');

  // ── AND ONE THAT IS REFUSED FOR CAUSE ────────────────────────
  //
  // Not "unreachable" — a bundle that arrived, parsed, and is wrong. Three
  // separate faults in one payload, each named. A gate nobody has watched
  // refuse anything is a gate nobody knows the shape of.
  const broken = await post('/operator/integrations', { id: 'broken', url: `http://127.0.0.1:${PORT}/broken` });
  ok('a malformed bundle is refused', broken.status === 422, String(broken.status));

  const reasons = (broken.json['reasons'] ?? []) as string[];
  ok('...for claiming somebody else’s namespace', reasons.some((r) => r.includes('belongs to somebody else')), reasons.find((r) => r.includes('belongs')) ?? '(not said)');
  ok('...for a component this app cannot render', reasons.some((r) => r.includes('Teleporter')), reasons.find((r) => r.includes('Teleporter')) ?? '(not said)');
  ok('...and for calling a fingerprint that does not exist', reasons.some((r) => r.includes('nothing/here')), reasons.find((r) => r.includes('nothing/here')) ?? '(not said)');
  ok('...and none of it landed', (await runtime.db.query("SELECT count(*) n FROM integration_actions WHERE integration_id = 'broken'")).rows[0] !== undefined && Number((await runtime.db.query("SELECT count(*) n FROM integration_actions WHERE integration_id = 'broken'")).rows[0]!['n']) === 0, 'whole-payload refusal');

  // ── removal revokes, in one act ──────────────────────────────
  //
  // Deleting the row is the whole revocation story: the hash the key resolves
  // through is gone, so every keyed call dies at the door — no second
  // mechanism, nothing to forget to also do.
  const removed = await server.request('/operator/integrations/belts', { method: 'DELETE', headers: { 'x-operator-key': KEY } });
  ok('removing the integration removes the row', removed.status === 200, String(removed.status));

  const dead = await asKey('st_northrock', 'automation/notify', {}, key);
  ok('...and its key died with it', dead.status === 401, `${dead.status} — one act, both directions`);

  // The listeners are closed BEFORE the report, because `report` exits the
  // process and a socket closing during exit trips a libuv assertion on
  // Windows.
  await closeLyraHttp();
  await service.close();
  report('an application arrived over a wire, for one tenant, and left again.');
} catch (err) {
  await closeLyraHttp();
  await service.close();
  throw err;
}
