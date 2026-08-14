// Run: pnpm --filter lyra exec tsx src/dev/integrations-check.ts
import { resolveCatalog } from '@niscorp/moss';
import { serve as listen } from '@hono/node-server';
import { startIntegrations } from '../../../lyra-integrations/src/serve';
import { CAST } from '@lyra/db/seed';
import { app, idFor, idsFor, login, mintToken, ok, report, runtime, server, servedTo, settle, treeOf } from './world';

const KEY = 'lab-operator-key';
runtime.operatorKey = KEY;

// Its own port, so a suite run cannot kill the instance somebody is looking at.
const PORT = 8798;
// The service trusts identity assertions signed by the deployment, so it needs
// the deployment's PUBLIC key — served openly, set the way an operator would.
const verifyKey = (await (await server.request('/api/integrations/verify-key')).json()) as { key: string };
process.env['LYRA_VERIFY_KEY'] = verifyKey.key;
const service = startIntegrations(PORT);

// Lyra on a real port: the service's keyed notify is an HTTP call INTO lyra,
// and an in-process hono has no address.
let lyraHttp: ReturnType<typeof listen> | undefined;
const closeLyraHttp = (): Promise<void> =>
  new Promise<void>((resolve) => {
    if (lyraHttp === undefined) return resolve();
    (lyraHttp as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    lyraHttp.close(() => setTimeout(resolve, 25));
  });

// Raw, not `asPrincipal`: that helper unwraps vex's `{ result }` envelope and an
// integration answers with a bare body.
const asIntegration = async (email: string, path: string, body: unknown): Promise<unknown> => {
  const token = await mintToken(email);
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

  const key = String(registered.json['key'] ?? '');
  ok('registration mints the integration key', key.startsWith('ik_'), `${key.slice(0, 6)}… — the deployment issues, never receives`);

  const again = await post('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/belts` });
  ok('...shown exactly once — a re-import repeats nothing', again.json['key'] === undefined, 'the plaintext is not stored, so it cannot come back');

  ok('a pending integration is in nobody’s application', !(await idsFor(CAST.northrock.owner)).some((id) => id.startsWith('ext.')), 'approval is what makes a grant real');

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
  const owner = await login(CAST.northrock.owner);
  await settle(10);
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  ok('the store lists what the operator approved', treeOf(owner).includes('Available'), 'belts, on sale');
  ok('...as a tile with the bundle’s meta', treeOf(owner).includes('Rank tracking for grappling gyms'), 'title and tagline, not an id');
  ok('...that says what appears where', treeOf(owner).includes('Adds'), treeOf(owner).match(/Adds[^.]*\./)?.[0] ?? '(no placement sentence)');

  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'belts' } });
  await settle(18);
  ok('...and installing flips it on', treeOf(owner).includes('On'), 'one row, written through the owner’s own policy');

  const northrock = await idsFor(CAST.northrock.owner);
  const lumen = await idsFor(CAST.lumen.owner);
  ok('the studio that installed it has the screens', northrock.includes('ext.desk.belts.roster'), northrock.filter((i) => i.startsWith('ext.')).join(', '));
  ok('...and the studio that did not, does not', !lumen.some((id) => id.startsWith('ext.')), 'one glob, two tenants, different applications');

  const nrMember = await idsFor(CAST.northrock.member);
  ok('a member at the installed studio gets the member half', nrMember.includes('ext.member.belts.mine'), nrMember.filter((i) => i.startsWith('ext.')).join(', '));
  ok('...and a member elsewhere does not', !(await idsFor(CAST.lumen.member)).some((id) => id.startsWith('ext.')));

  // ── the pack's words translate with everything else ──────────
  //
  // The bundle carried a `de` phrasebook; the host stored it at intake and
  // merges it UNDER its own book. A German member's navigation must not read
  // `Kurs buchen · Meine Kurse · My belt` — the mixed row the product review
  // photographed. Flipped before this member's first shell exists, so the
  // build reads the German book; flipped back before anybody else logs in.
  await runtime.db.query("UPDATE studios SET locale = 'de-AT' WHERE id = $1", ['st_northrock']);
  // The raw UPDATE rides no write path, and the member's identity — locale
  // included — is resolved and held; drop it the way the language switch does.
  server.invalidateTenant('st_northrock');
  const germanShell = await login(CAST.northrock.member);
  await settle(12);
  germanShell.dispatch({ type: 'ui:click', ref: 'navLeaf', payload: { value: 'ext.member.belts.mine', label: 'My belt' } });
  await settle(14);
  const germanMember = await servedTo(CAST.northrock.member);
  ok("a pack's screen renders German", germanMember.includes('Mein Gürtel'), 'My belt → Mein Gürtel, from the bundle’s own book');
  ok('...through the same pass as the host’s words', germanMember.includes('Heute'), 'host and pack words in ONE German shell');
  await runtime.db.query("UPDATE studios SET locale = 'en-GB' WHERE id = $1", ['st_northrock']);
  server.invalidateTenant('st_northrock');

  // ── the proxy carries identity the caller cannot forge ───────
  const mine = await asIntegration(CAST.northrock.member, '/integrations/belts/mine', {});
  ok('a proxied call reaches the other service', typeof (mine as { belt?: unknown }).belt === 'string', JSON.stringify(mine));
  ok('...and it answers about the RIGHT person', (mine as { belt?: string }).belt === 'Purple', `${(mine as { belt?: string }).belt} — keyed on a header the browser never set`);

  const forged = await asIntegration(CAST.northrock.member, '/integrations/belts/mine', { personId: 'p_nina', studioId: 'st_lumen' });
  ok('a forged body does not move the answer', JSON.stringify(forged) === JSON.stringify(mine), 'the body is not where identity comes from');

  const roster = (await asIntegration(CAST.northrock.owner, '/integrations/belts/roster', {})) as unknown[];
  ok('the roster is the installing studio’s own', Array.isArray(roster) && roster.length === selftest['north'], `${Array.isArray(roster) ? roster.length : -1} rows`);

  const refused = await server.request('/integrations/belts/roster', { method: 'POST', body: '{}' });
  ok('...and anonymous gets nothing', refused.status === 401, String(refused.status));

  // ── THE DECLARATION IS THE PERIMETER ─────────────────────────
  //
  // `/belts/_selftest` is a real route on the pack — line 55 above reads belt
  // counts off it — and the bundle never declared it. The proxy used to forward
  // ANY path under a pack's prefix to anybody signed in at an installed studio,
  // so being a member here was permission to call it, and to call whatever else
  // that service grew next release. Now reach is derived from the bundle at
  // intake (moss: reachOf) and this is not in it.
  const undeclared = await server.request('/integrations/belts/_selftest', {
    headers: { Authorization: `Bearer ${String(await mintToken(CAST.northrock.owner))}` },
  });
  ok('an undeclared path is not forwarded', undeclared.status === 404, `${undeclared.status} — the owner is signed in and the studio has it installed`);
  ok('...and the route it refuses is really there', (selftest['north'] ?? 0) > 0, 'the 404 is the proxy declining, not the pack having moved');

  // ── the integration acts as itself ───────────────────────────
  const asKey = async (actsFor: string, fingerprint: string, context: unknown, withKey: string = key): Promise<{ status: number; body: Record<string, unknown> }> => {
    const response = await server.request('/api/automation/vex', {
      method: 'POST',
      headers: { Authorization: `Bearer ${withKey}`, 'x-nisc-acts-for': actsFor, 'content-type': 'application/json' },
      body: JSON.stringify({ fingerprint, context }),
    });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  };

  const omar = { id: idFor(CAST.northrock.member) };
  const noted = await asKey('st_northrock', 'automation/notify', { personId: omar?.id ?? '', kind: 'integration', subject: 'Graded', body: 'Omar holds Purple.' });
  ok('a keyed mutation lands', noted.status === 200, JSON.stringify(noted.body).slice(0, 80));

  const landed = await runtime.db.query("SELECT studio_id FROM notifications WHERE title = 'Graded'");
  ok('...stamped with the studio the KEY acts for', (landed.rows[0] as { studio_id?: string } | undefined)?.studio_id === 'st_northrock', 'scope came from the actor, not the request');

  const overreach = await asKey('st_northrock', 'automation/lapse-trial', { personId: 'p_omar' });
  ok('...and a fingerprint outside its rung is refused', overreach.status >= 400, `${overreach.status} — the charter bounds unattended code too`);

  const elsewhere = await asKey('st_lumen', 'automation/notify', { personId: '', kind: 'integration', subject: 'x', body: '' });
  ok('...and a studio without the install has no actor for it', elsewhere.status === 403, String(elsewhere.status));

  const gibberish = await asKey('st_northrock', 'automation/notify', {}, 'ik_0000000000000000000000000000000000000000000000000000000000000000');
  ok('...and a key nobody minted resolves to nobody', gibberish.status === 401, String(gibberish.status));

  // ── ONE RUNG PER PACK, not one rung for every pack ───────────
  //
  // Every installed pack used to resolve to the same `integration` principal, so
  // the day one of them needed to touch money, the grant would have been added
  // to the rung a rank tracker also holds. The rung is derived from the actor's
  // own id now (`ig_<pack>@<studio>` — app.ts), so a pack with a rung of its own
  // gets it and everything else keeps the near-empty shared one.
  //
  // Belts is the control. It is installed, its key works, and this is the write
  // it must not have.
  const beltsAssert = await asKey('st_northrock', 'subscriptions/assert', {
    subscriptionId: 'sub_omar', status: 'cancelled', paidUntil: null, priceCents: 0,
  });
  ok('a rank tracker cannot move somebody’s standing', beltsAssert.status >= 400, `${beltsAssert.status} — the same key that just wrote a follow-up`);

  const stillActive = await runtime.db.query("SELECT count(*) n FROM subscriptions WHERE id = 'sub_omar' AND status = 'active'");
  ok('...and nothing moved', Number((stillActive.rows[0] as { n: string }).n) === 1, 'refused by the charter, not by the pack being polite');

  // Now the pack the rung was drawn for. Same ceremony, same wire — the only
  // difference is which fence it lands inside.
  const stripeReg = await post('/operator/integrations', { id: 'stripe', url: `http://127.0.0.1:${PORT}/stripe` });
  const stripeKey = String(stripeReg.json['key'] ?? '');
  await post('/operator/integrations/stripe/approve', {});
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'stripe' } });
  await settle(18);

  const paidUntil = '2027-01-31';
  const asserted = await asKey('st_northrock', 'subscriptions/assert', {
    subscriptionId: 'sub_omar', status: 'active', paidUntil, priceCents: null,
  }, stripeKey);
  ok('the payments pack may state a standing', asserted.status === 200, JSON.stringify(asserted.body).slice(0, 80));

  const isoDay = (value: unknown): string => (value === null || value === undefined ? '' : new Date(String(value)).toISOString().slice(0, 10));
  const assertedRow = await runtime.db.query("SELECT paid_until, studio_id FROM subscriptions WHERE id = 'sub_omar'");
  const paidRow = assertedRow.rows[0] as { paid_until?: unknown; studio_id?: string } | undefined;
  ok('...and it lands, stamped with the studio the KEY acts for', isoDay(paidRow?.paid_until) === paidUntil && paidRow?.studio_id === 'st_northrock', `paid until ${isoDay(paidRow?.paid_until)}, at ${String(paidRow?.studio_id)}`);

  // ASSERTIONS, NEVER DELTAS. A payment provider redelivers; applying the same
  // statement twice has to mean the same thing, or every retry is a bug.
  const again2 = await asKey('st_northrock', 'subscriptions/assert', {
    subscriptionId: 'sub_omar', status: 'active', paidUntil, priceCents: null,
  }, stripeKey);
  const twice = await runtime.db.query("SELECT paid_until FROM subscriptions WHERE id = 'sub_omar'");
  ok('...and re-applying it changes nothing', again2.status === 200 && isoDay((twice.rows[0] as { paid_until?: unknown }).paid_until) === paidUntil, 'idempotent by construction — there is no delta to double');

  // The fence has two sides. Holding a payments rung is not holding the app.
  // Ending a SUBSCRIPTION is billing's to state (a cancelled card plan is a
  // cancelled plan); the RELATIONSHIP — who the studio knows, their notes,
  // their trial — is the anchor row, and no payment provider may touch it.
  const overreachStripe = await asKey('st_northrock', 'people/update', { personId: 'p_omar', notes: 'pwned', trialEndsOn: null }, stripeKey);
  ok('...but it cannot rewrite who the studio knows', overreachStripe.status >= 400, `${overreachStripe.status} — standing is not the same fact as belonging`);
  const anchorUntouched = await runtime.db.query("SELECT count(*) n FROM studio_people WHERE person_id = 'p_omar' AND notes = 'pwned'");
  ok('...and the anchor is untouched', Number((anchorUntouched.rows[0] as { n: string }).n) === 0, 'refused at the verb, not tidied up after');

  // ...AND CANNOT END SOMEBODY'S MEMBERSHIP BY GIVING NOTICE FOR THEM.
  //
  // This is why notice has its own table. A charter grant is `table.verb`
  // (packages/charter/src/types.ts) with no per-statement granularity, so while
  // notice was a column on `subscriptions`, the rung that needs
  // `subscriptions.write.update` to assert a standing reached
  // `subscriptions/give-notice` too — and this call returned 200. The fence is
  // drawn by the engine now, not by the pack choosing not to.
  const noticeGrab = await asKey('st_northrock', 'subscriptions/give-notice', { subscriptionId: 'sub_omar' }, stripeKey);
  ok('...nor give notice on somebody’s behalf', noticeGrab.status >= 400, `${noticeGrab.status} — a person decides that, and a billing system is not a person`);

  const noNotice = await runtime.db.query("SELECT count(*) n FROM subscription_notices WHERE subscription_id = 'sub_omar'");
  ok('...and no notice was written', Number((noNotice.rows[0] as { n: string }).n) === 0, 'refused at the verb, not tidied up after');

  const withdrawGrab = await asKey('st_northrock', 'subscriptions/withdraw-notice', { subscriptionId: 'sub_tobias' }, stripeKey);
  ok('...nor take one back', withdrawGrab.status >= 400, `${withdrawGrab.status} — the same table, the same fence`);

  // ── placement: the pack's screens live with their domain ─────
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
  await settle(14);
  ok('a placed screen joins its domain’s tabs', treeOf(owner).includes('Belts'), 'People: Members, Enquiries, Staff — and Belts, placed by the bundle');

  owner.dispatch({ type: 'ui:click', ref: 'navLeaf', payload: { value: 'ext.desk.belts.roster', label: 'Belts' } });
  await settle(16);
  const tree = treeOf(owner);
  ok('an integration screen mounts in a real shell', tree.includes('Who holds what, and who is due'), 'authored in another repository');
  ok('...filled from the integration', tree.includes('Purple'), 'a belt, from a service with no row in this database');
  ok('...named from Lyra, in the same layout', tree.includes('Omar Haddad') && tree.includes('Nina Vogel') && tree.includes('Ruben Marek'), 'the join the first version only claimed');
  ok('...every row, not just one', !/person_name[^,}]*mb_/.test(tree), 'no row fell back to its identifier');

  // ── the panel rides the member record ────────────────────────
  lyraHttp = listen({ fetch: server.fetch, port: 8797 });
  process.env['LYRA_BASE'] = 'http://127.0.0.1:8797';
  process.env['BELTS_KEY'] = key;

  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'people.list' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'open', payload: { person_id: 'p_omar' } });
  await settle(16);
  ok('the member record offers the pack’s panel', treeOf(owner).includes('Belt'), 'the riders’ strip, derived per studio');
  ok('...wearing the pack’s preview — the belt, stripes and all', treeOf(owner).includes('Purple — 2nd stripe · since'), 'display atoms over the session’s own wire');

  owner.dispatch({ type: 'ui:click', ref: 'openAttachment', payload: { action: 'ext.desk.belts.panel' } });
  await settle(16);
  const panel = treeOf(owner);
  ok('the panel opens with the member’s belt', panel.includes('Purple — 2nd stripe'), 'belt and stripes, from what the host offered');
  ok('...and their history', panel.includes('2022-03-19'), 'the pack’s own rows');

  owner.dispatch({ type: 'ui:click', ref: 'stripe', payload: {} });
  await settle(14);
  ok('Add stripe asks before it acts', treeOf(owner).includes('Add a stripe?'), 'Lyra’s confirm sheet, pushed by the pack');
  owner.dispatch({ type: 'ui:click', ref: 'cancel', payload: {} });
  await settle(14);
  ok('...and cancel changes nothing', treeOf(owner).includes('Purple — 2nd stripe'), 'a mistake costs a click, not a correction');

  owner.dispatch({ type: 'ui:click', ref: 'stripe', payload: {} });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'confirm', payload: {} });
  await settle(20);
  ok('Add stripe advances the bar', treeOf(owner).includes('Purple — 3rd stripe'), 'same belt, more tape');

  const striped = await runtime.db.query("SELECT title AS subject FROM notifications WHERE title LIKE '%3rd stripe%'");
  ok('...and Lyra’s inbox heard the advancement', String((striped.rows[0] as { subject?: string } | undefined)?.subject ?? '') === 'Omar Haddad earned their 3rd stripe on Purple.', String((striped.rows[0] as { subject?: string } | undefined)?.subject ?? '(nothing)'));

  owner.dispatch({ type: 'ui:click', ref: 'promote', payload: {} });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'confirm', payload: {} });
  await settle(20);
  ok('Promote advances the belt — and RESETS the bar', treeOf(owner).includes('Brown') && !treeOf(owner).includes('Brown — '), 'the stripes belonged to the old belt');

  const heard = await runtime.db.query("SELECT studio_id, title AS subject FROM notifications WHERE title LIKE '%promoted to Brown%'");
  const note = heard.rows[0] as { studio_id?: string; subject?: string } | undefined;
  ok('...and Lyra’s inbox heard about it BY NAME', note?.subject === 'Omar Haddad was promoted to Brown.', note?.subject ?? '(nothing landed)');
  ok('...through the pack’s own key, stamped to the studio', note?.studio_id === 'st_northrock', 'the first real consumer of an integration key');

  // ── every edit is reversible: the ledger is the undo stack ───
  owner.dispatch({ type: 'ui:click', ref: 'undo', payload: {} });
  await settle(14);
  ok('Undo asks too', treeOf(owner).includes('Undo the last change?'), 'a correction is still an edit');
  owner.dispatch({ type: 'ui:click', ref: 'confirm', payload: {} });
  await settle(20);
  ok('...and winds the record back one step', treeOf(owner).includes('Purple — 3rd stripe'), 'the promotion came off; the stripes it reset came back');

  const corrected = await runtime.db.query("SELECT title AS subject FROM notifications WHERE title LIKE 'Correction:%'");
  ok('...announced as a correction', String((corrected.rows[0] as { subject?: string } | undefined)?.subject ?? '') === 'Correction: Omar Haddad is back to Purple — 3rd stripe.', String((corrected.rows[0] as { subject?: string } | undefined)?.subject ?? '(nothing)'));

  // ── the wall at four, and the white-belt floor ───────────────
  const fourth = await asIntegration(CAST.northrock.owner, '/integrations/belts/stripe', { personId: 'p_ruben' });
  ok('a fourth stripe fits', (fourth as { stripes?: number }).stripes === 4, 'the last piece of tape');
  const fifth = await asIntegration(CAST.northrock.owner, '/integrations/belts/stripe', { personId: 'p_ruben' });
  ok('...and there is no fifth', (fifth as { status?: number }).status === 400, 'four is the wall; the next step is a promotion');

  const fresh = await asIntegration('hana.oksana@example.com', '/integrations/belts/mine', {});
  ok('there is no unranked — a new member IS a white belt', (fresh as { belt?: string }).belt === 'White', JSON.stringify(fresh).slice(0, 60));

  // ── the settings door, on the tile and nowhere else ──────────
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

  // ── a DEAD pack answers in sentences, not status codes ───────
  //
  // A third-party service being down is the steady state of a marketplace.
  // The screen in front of it belongs to a studio owner: the floor under a
  // pack that answers nothing usable is a sentence naming the pack, and a
  // bare `HTTP 500` reaching the glass is the defect. The pack's own words,
  // when it manages any, always win — the throw-wrapper in pack.ts is the
  // other half of the same contract.
  // The raw UPDATE rides no write path, so the derivations must be dropped
  // the way an install write drops them.
  await runtime.db.query("UPDATE integrations SET url = 'http://127.0.0.1:9/belts' WHERE id = 'belts'");
  server.refresh();
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(10);
  owner.dispatch({ type: 'ui:click', ref: 'openSettings', payload: { settings_action: 'ext.desk.belts.settings' } });
  await settle(18);
  const deadTree = treeOf(owner);
  ok('a dead pack is a sentence naming the pack', deadTree.includes('The belts add-on is not answering right now'), 'the floor the wire puts under every integration call');
  ok('...never a bare status code', !/HTTP \d/.test(deadTree), 'a studio owner cannot act on a number');
  await runtime.db.query('UPDATE integrations SET url = $1 WHERE id = $2', [`http://127.0.0.1:${String(PORT)}/belts`, 'belts']);
  server.refresh();

  // ── the toggle, both directions, through the button ──────────
  owner.dispatch({ type: 'ui:click', ref: 'nav', payload: 'studio.addons' });
  await settle(14);
  owner.dispatch({ type: 'ui:click', ref: 'uninstall', payload: { integration_id: 'belts' } });
  await settle(18);
  // PER PACK, not per studio: this studio also has the payments pack installed
  // now, and an assertion that no ext.* survives would be asserting that
  // uninstalling one pack takes every pack's screens away.
  ok('uninstalling takes the screens away', !(await idsFor(CAST.northrock.owner)).some((id) => id.startsWith('ext.desk.belts.') || id.startsWith('ext.member.belts.')), 'the row stays, disabled; the studio stopped paying');

  owner.dispatch({ type: 'ui:click', ref: 'install', payload: { integration_id: 'belts' } });
  await settle(18);
  ok('...and installing AGAIN works — the row it left behind is re-enabled', (await idsFor(CAST.northrock.owner)).includes('ext.desk.belts.roster'), 'an update where the first install was an insert');

  owner.dispatch({ type: 'ui:click', ref: 'uninstall', payload: { integration_id: 'belts' } });
  await settle(18);
  ok('...and off again, for the assertions below', !(await idsFor(CAST.northrock.owner)).some((id) => id.startsWith('ext.desk.belts.') || id.startsWith('ext.member.belts.')));

  const afterRemoval = await asIntegration(CAST.northrock.owner, '/integrations/belts/roster', {});
  ok('...and the proxy stops forwarding', (afterRemoval as { status?: number }).status === 404, JSON.stringify(afterRemoval));

  const orphaned = await asKey('st_northrock', 'automation/notify', { personId: '', kind: 'integration', subject: 'x', body: '' });
  ok('...and the key lost its actor with the install', orphaned.status === 403, String(orphaned.status));

  // ── a bad bundle is refused whole ────────────────────────────
  const bad = await post('/operator/integrations', { id: 'belts', url: `http://127.0.0.1:${PORT}/nope` });
  ok('a bundle that cannot be fetched is refused', bad.status === 502, String(bad.status));
  ok('...and the app is still standing', (await idsFor(CAST.northrock.owner)).length > 0, 'a refusal is not an outage');

  // ── and one that is refused for cause ────────────────────────
  const broken = await post('/operator/integrations', { id: 'broken', url: `http://127.0.0.1:${PORT}/broken` });
  ok('a malformed bundle is refused', broken.status === 422, String(broken.status));

  const reasons = (broken.json['reasons'] ?? []) as string[];
  ok('...for claiming somebody else’s namespace', reasons.some((r) => r.includes('belongs to somebody else')), reasons.find((r) => r.includes('belongs')) ?? '(not said)');
  ok('...for a component this app cannot render', reasons.some((r) => r.includes('Teleporter')), reasons.find((r) => r.includes('Teleporter')) ?? '(not said)');
  ok('...and for calling a fingerprint that does not exist', reasons.some((r) => r.includes('nothing/here')), reasons.find((r) => r.includes('nothing/here')) ?? '(not said)');
  ok('...and none of it landed', (await runtime.db.query<{ n: number }>("SELECT count(*) n FROM integration_actions WHERE integration_id = 'broken'")).rows[0] !== undefined && Number((await runtime.db.query<{ n: number }>("SELECT count(*) n FROM integration_actions WHERE integration_id = 'broken'")).rows[0]!['n']) === 0, 'whole-payload refusal');

  // ── removal revokes, in one act ──────────────────────────────
  const removed = await server.request('/operator/integrations/belts', { method: 'DELETE', headers: { 'x-operator-key': KEY } });
  ok('removing the integration removes the row', removed.status === 200, String(removed.status));

  const dead = await asKey('st_northrock', 'automation/notify', {}, key);
  ok('...and its key died with it', dead.status === 401, `${dead.status} — one act, both directions`);

  // Closed before the report: `report` exits the process, and a socket closing
  // during exit trips a libuv assertion on Windows.
  // Closed before the report: `report` exits the process, and a socket closing
  // during exit trips a libuv assertion on Windows.
  await closeLyraHttp();
  await service.close();
  report('an application arrived over a wire, for one tenant, and left again.');
} catch (err) {
  await closeLyraHttp();
  await service.close();
  throw err;
}
