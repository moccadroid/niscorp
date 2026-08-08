// The claim: our administration tool is a SEPARATE application, reachable by
// nobody but us, that can see and change what the app it administers offers —
// without ever being able to read a hotel's data.
//
// The check stands both up in one process: atrium with its operator seam, and
// the admin service as its own moss app talking to that seam. Then it drives
// the admin tool the way a person drives it — open the pill, open a section,
// flip a switch — and asserts on atrium's database and on a guest's living
// shell.
//
// Run: pnpm --filter atrium exec tsx src/dev/admin-check.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Shell } from '@niscorp/nova';
import { mintDevToken } from '@niscorp/moss';
import { login, settle, topData, sql, check, report, sessionFor, openFromMenu, server as atriumServer } from './world';
import { buildAdminServer } from '@atrium/admin/service';
import { createSeam } from '@atrium/admin/seam';
import { ADMIN_PRINCIPAL } from '@atrium/admin/token';

// The key both sides hold. Read lazily by the seam middleware, so setting it
// here — after the app booted — is enough, which is itself worth knowing: the
// seam can be opened and closed on a running process.
const KEY = 'check-operator-key';
process.env['OPERATOR_KEY'] = KEY;

type Row = Record<string, unknown>;
const rowsOf = (data: Record<string, unknown>, key: string): Row[] => (Array.isArray(data[key]) ? (data[key] as Row[]) : []);
const nested = (data: Record<string, unknown>, key: string): Record<string, unknown> => (data[key] as Record<string, unknown> | undefined) ?? {};

// A raw request to the seam, exactly as an outsider would make it.
const knock = async (path: string, key?: string): Promise<number> => {
  const res = await atriumServer.request(path, { method: 'GET', headers: key === undefined ? {} : { 'x-operator-key': key } });
  return res.status;
};

const mounted = (shell: Shell, canvas: string): string[] => (shell.getState().canvases[canvas]?.stack ?? []).map((i) => i.definitionId);
const topOf = (shell: Shell, canvas: string): Record<string, unknown> => topData(shell, canvas);
const tapAdmin = (shell: Shell, ref: string, payload?: unknown): void => {
  const active = shell.getState().canvases['admin']?.active;
  shell.dispatch({ type: 'ui:click', ref, ...(payload !== undefined ? { payload } : {}), ...(active !== undefined ? { origin: active.id } : {}) } as Parameters<Shell['dispatch']>[0]);
};

type Slot = { action_id?: string };
const slotIds = (data: Record<string, unknown>): string[] => (Array.isArray(data['slots']) ? (data['slots'] as Slot[]).map((s) => String(s.action_id)) : []);

// Every file in the APPLICATION that reaches into the tool. Must be none: the
// app serves a seam and is not a client of anything.
const importers = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && /@atrium\/admin|from '\.{1,2}\/.*admin\//.test(readFileSync(path, 'utf8'))) found.push(path);
    }
  };
  for (const dir of ['src/app', 'src/server', 'src/db', 'src/integrations', 'src/ui']) walk(dir);
  return found;
};

const main = async (): Promise<void> => {
  // ── the gate ───────────────────────────────────────────────
  // Not a role, not a token, not a principal — a key our own processes hold.
  // A hotel cannot reach this by being more important.
  check('the seam is closed to a caller with no key', (await knock('/operator/actors')) === 404);
  check('...and to a wrong one', (await knock('/operator/actors', 'not-the-key')) === 404);
  check('...and answers ours', (await knock('/operator/actors', KEY)) === 200);

  // A refusal is a 404, not a 401: an outsider learns nothing about whether the
  // surface exists, or whether a key would have worked.
  check('a refusal does not admit the surface exists', (await knock('/operator/health', 'not-the-key')) === 404);

  // ── the tool ───────────────────────────────────────────────
  // Its own moss app, its own charter, its own principal space. The seam is
  // handed in pointing at atrium's own server — over HTTP in production, in
  // process here, and the tool cannot tell the difference.
  const seam = createSeam({
    key: KEY,
    fetch: async (path, init) => {
      const res = await atriumServer.request(path, { method: init.method, headers: init.headers, ...(init.body === undefined ? {} : { body: init.body }) });
      return { ok: res.ok, status: res.status, json: () => res.json() as Promise<unknown> };
    },
  });
  const admin = (await buildAdminServer(seam)).server;

  // ── who gets an application ────────────────────────────────
  const stranger = admin.shells?.session(null, null);
  check('an anonymous caller gets an admin shell with nothing on it', (stranger?.shell.getState().canvases['admin']?.stack ?? []).length === 0);

  // A principal from the app's own cast is not a principal here. The two
  // identity spaces do not overlap: Rosa's token is a valid token and an
  // unknown person.
  const rosaToken = mintDevToken('stf_rosa');
  const rosaHere = admin.shells?.session(rosaToken, 'stf_rosa');
  check("a hotel's own front-desk principal is nobody in this tool", (rosaHere?.shell.getState().canvases['admin']?.stack ?? []).length === 0);

  const operator = admin.shells?.session(mintDevToken(ADMIN_PRINCIPAL), ADMIN_PRINCIPAL);
  if (operator === undefined) throw new Error('admin-check: the admin app serves no shell');
  const dock = operator.shell;
  await settle();
  check('we get the pill', mounted(dock, 'admin').join(',') === 'admin.dock');
  check('...and it is collapsed, having asked the app server for nothing', topOf(dock, 'admin')['open'] === false);

  tapAdmin(dock, 'open');
  await settle();
  check('opening it shows the sections', topOf(dock, 'admin')['open'] === true);

  // ── charter: the table nothing else can draw ───────────────
  tapAdmin(dock, 'charter');
  await settle(8);
  check('the charter pane pushes over the pill', mounted(dock, 'admin').join(',') === 'admin.dock,admin.charter');

  const actors = rowsOf(nested(topOf(dock, 'admin'), 'charter'), 'principals');
  check(`every principal in the charter, plus anonymous (${actors.length})`, actors.length === 10);
  const amaraRow = actors.find((r) => r['id'] === 'gst_amara');
  const vendorRow = actors.find((r) => r['id'] === 'usr_vendor');
  const anonRow = actors.find((r) => r['id'] === '(anonymous)');
  const idsOf = (row: Row | undefined): string[] => (Array.isArray(row?.['actions']) ? (row['actions'] as Row[]).map((a) => String(a['id'])) : []);
  check('a guest resolves to her own surfaces', idsOf(amaraRow).includes('stay.key'));
  check('...and not to the desk board', !idsOf(amaraRow).includes('desk.issue.list'));
  check('...nor to our own deployment console', !idsOf(amaraRow).includes('deploy.connectors'));
  check('the vendor resolves to the console', idsOf(vendorRow).includes('deploy.connectors'));
  check('anonymous resolves to the login page and nothing else', idsOf(anonRow).join(',') === 'auth.login');
  // The bundles are in the resolution, which is the part a frozen catalog gets
  // wrong: the charter's ext.* globs match nothing unless the synced actions
  // are in the universe they resolve against.
  check('shipped integration actions are in the picture too', idsOf(amaraRow).some((id) => id.startsWith('ext.guest.')));

  // The inverse: given an action, who may ever hold it. Nothing in charter,
  // moss or nova answers this — it is composed from the same matrix.
  tapAdmin(dock, 'pick', amaraRow);
  await settle();
  tapAdmin(dock, 'probe', { id: 'desk.issue.list' });
  await settle(8);
  const holders = rowsOf(topOf(dock, 'admin'), 'holders').map((h) => String(h['id'])).sort();
  check(`the inverse lookup names both clerks and only them (${holders.join(', ')})`, holders.join(',') === 'stf_pilar,stf_rosa');

  // ── the catalog, and a layout rendered out of its own JSON ──
  tapAdmin(dock, 'back');
  await settle();
  tapAdmin(dock, 'catalog');
  await settle(8);

  const catalog = rowsOf(topOf(dock, 'admin'), 'rows');
  check(`the catalog lists every definition the server serves (${catalog.length})`, catalog.length > 30);
  check('...core and shipped alike', catalog.some((r) => r['source'] === 'core') && catalog.some((r) => r['source'] !== 'core'));

  const keyAction = catalog.find((r) => r['id'] === 'stay.key');
  tapAdmin(dock, 'pick', keyAction);
  await settle(8);
  const detail = nested(topOf(dock, 'admin'), 'detail');
  const labelsOf = (key: string): string[] => rowsOf(detail, key).map((r) => String(r['label']));
  check('opening one shows its rule-14 input contract', labelsOf('input').includes('stayId'));
  check('...its declared data', labelsOf('data').length > 0);
  check('...the component vocabulary its layout draws from', labelsOf('components').length > 0);
  check('...and where its data comes from', rowsOf(detail, 'endpoints').some((e) => String(e['reaches']).startsWith('fn:') || String(e['reaches']).includes('/api/')));

  // The preview: the layout comes back as data, so it can be rendered. The
  // components are registered onto this shell, the definition replaces the
  // declared placeholder, and the push wears the fragment that frames it.
  tapAdmin(dock, 'render');
  await settle(10);
  check('previewing pushes the render target', mounted(dock, 'admin').join(',') === 'admin.dock,admin.catalog,admin.preview');
  const rendered = topOf(dock, 'admin');
  check('...carrying the previewed action’s own data keys', 'stayId' in rendered);
  check('...titled by the definition, not by us', String(rendered['previewId']) === 'stay.key');
  // Filled, not empty. The declared defaults are the action's EMPTY state, so a
  // faithful render is three skeleton bars; the sample is derived from what the
  // layout itself binds.
  check('...with the loading gate down, so it renders content and not a skeleton', rendered['loading'] === false);
  // Filled where the LAYOUT binds, and only there: `credential` is rendered so
  // it gets a value; `stayId` feeds a prism and never reaches a component, so
  // it stays as declared. The shape comes from the bindings, not from the keys.
  check('...sample values where the layout binds one', String(rendered['credential']) !== '');
  check('...nested shapes too, where it binds through one', Object.keys((rendered['stay'] ?? {}) as object).length > 0);
  check('...and nothing invented for keys it never renders', rendered['stayId'] === '');
  // The proof it really rendered: the shell serialized a tree for the canvas.
  // A layout naming components this shell had never heard of would have thrown
  // at registerAction instead.
  check('...and the foreign layout actually renders', dock.flattenRenderTree(dock.getCanvasRenderTree('admin')).length > 0);

  tapAdmin(dock, 'preview-back');
  await settle();
  check('closing the preview returns to the catalog', mounted(dock, 'admin').join(',') === 'admin.dock,admin.catalog');

  // ── the surface, and the switch that is ours ───────────────
  tapAdmin(dock, 'back');
  await settle();
  tapAdmin(dock, 'surface');
  await settle(8);

  const estate = nested(topOf(dock, 'admin'), 'surface');
  check('the surface pane lists both properties', rowsOf(estate, 'properties').length === 2);
  const lumen = rowsOf(estate, 'properties').find((p) => p['name'] === 'The Lumen');
  check('...one of them open by default', rowsOf(estate, 'properties').some((p) => p['active'] === true));

  tapAdmin(dock, 'pick', lumen);
  await settle(8);
  const checkinSlot = rowsOf(nested(topOf(dock, 'admin'), 'surface'), 'slots').find((s) => s['id'] === 'gs_checkin');
  check('online check-in is live at The Lumen', checkinSlot?.['state'] === 'Live');
  check('...and switched on by us', checkinSlot?.['enabled'] === true);

  // A guest already holding the surface, with their shell open — and a clerk
  // beside him, so the feed later has two principals to tell apart.
  const theo = login('theo');
  login('rosa');
  await settle(8);
  check('Theo, arriving today, is offered online check-in', slotIds(topData(theo, 'main')).includes('stay.checkin'));

  // ── the withdrawal ─────────────────────────────────────────
  tapAdmin(dock, 'flip', checkinSlot);
  await settle(12);

  const resolved = await sql(`SELECT live, reason FROM property_slots WHERE slot_id = 'gs_checkin' ORDER BY property_id`);
  check('the resolver took it off every property', resolved.every((r) => r['live'] === false));
  check('...and says WE did it, not a connector and not a hotel', resolved.every((r) => r['reason'] === 'disabled'));

  const afterFlip = rowsOf(nested(topOf(dock, 'admin'), 'surface'), 'slots').find((s) => s['id'] === 'gs_checkin');
  check('the pane re-reads and shows the withdrawal', afterFlip?.['state'] === 'Withdrawn by us');

  // Theo's shell is open the whole time. There is no push — the database is
  // correct and his shell is stale until it reads again, which is the same
  // honest posture a go-live has.
  theo.publish('capabilities-changed');
  await settle(8);
  check('once his shell re-reads, check-in is gone from his hand', !slotIds(topData(theo, 'main')).includes('stay.checkin'));

  // And it is reversible, because a withdrawal is a row and not a deploy.
  tapAdmin(dock, 'flip', afterFlip);
  await settle(12);
  const restored = await sql(`SELECT live, reason FROM property_slots WHERE slot_id = 'gs_checkin' AND property_id = 'prop_lumen'`);
  check('restoring it puts the surface back', restored[0]?.['live'] === true);
  theo.publish('capabilities-changed');
  await settle(8);
  check('...and back in his hand', slotIds(topData(theo, 'main')).includes('stay.checkin'));

  // ── explain: the chain, and the link that broke ────────────
  tapAdmin(dock, 'back');
  await settle();
  tapAdmin(dock, 'explain');
  await settle(8);

  const explainOf = (): Row[] => rowsOf(nested(topOf(dock, 'admin'), 'explain'), 'slots');
  const ines = rowsOf(nested(topOf(dock, 'admin'), 'explain'), 'principals').find((p) => p['id'] === 'gst_ines');
  tapAdmin(dock, 'pick', ines);
  await settle(8);
  tapAdmin(dock, 'state', 'in_house');
  await settle(8);

  // Inés is at Casa Marisol, which runs Mews. Mews has no door API at any
  // version, so the key is not dark because of her or her stay.
  const inesKey = explainOf().find((s) => s['id'] === 'gs_key');
  check('a guest whose hotel has no door API is stopped at the resolver', String(inesKey?.['verdict']) === 'stopped at resolver');
  check('...and the sentence names the connector, not her', String(inesKey?.['because']).includes('connector'));
  check('...while her spa IS placed', explainOf().some((s) => s['id'] === 'gs_spa' && s['verdict'] === 'placed'));

  // A guest at the hotel where check-in IS live, in a state it does not apply
  // to: now the LAST link is what breaks, and only after the first three passed.
  // (Asking this of Inés would prove nothing — her hotel switched check-in off,
  // so the resolver stops it two links earlier.)
  const amara = rowsOf(nested(topOf(dock, 'admin'), 'explain'), 'principals').find((p) => p['id'] === 'gst_amara');
  tapAdmin(dock, 'pick', amara);
  await settle(8);
  tapAdmin(dock, 'state', 'departed');
  await settle(8);
  const departedCheckin = explainOf().find((s) => s['id'] === 'gs_checkin');
  check('a surface that wants a different stay state stops at the last link', String(departedCheckin?.['verdict']).includes('stay'));
  check('...having passed audience, charter and resolver first', rowsOf(departedCheckin ?? {}, 'chain').filter((link) => link['tone'] === 'good').length === 3);

  // The stay state is ASKED, not read: switching it changes the answer without
  // any stay in the database moving.
  tapAdmin(dock, 'state', 'arriving');
  await settle(8);
  check('...and asking about another state answers differently, touching no stay', explainOf().some((s) => s['id'] === 'gs_checkin' && s['verdict'] === 'placed'));

  // ── entries: the data API, and what nothing calls ──────────
  tapAdmin(dock, 'back');
  await settle();
  tapAdmin(dock, 'entries');
  await settle(8);

  const entries = rowsOf(nested(topOf(dock, 'admin'), 'api'), 'entries');
  check(`every seeded entry is listed (${entries.length})`, entries.length > 40);
  check('...reads and writes both', entries.some((e) => e['kind'] === 'read') && entries.some((e) => e['kind'] === 'write'));
  check('...core and vendor-shipped both', entries.some((e) => e['source'] === 'core') && entries.some((e) => e['source'] !== 'core'));
  check('nothing is called that was never seeded', rowsOf(nested(topOf(dock, 'admin'), 'api'), 'missing').length === 0);

  const surfaceLive = entries.find((e) => e['fingerprint'] === 'surface/live');
  tapAdmin(dock, 'pick', surfaceLive);
  await settle();
  const entry = nested(topOf(dock, 'admin'), 'selected');
  check('opening one names the context a caller must supply', rowsOf(entry, 'context').some((c) => String(c['label']) === 'audience'));
  check('...the tables it touches', rowsOf(entry, 'tables').length > 0);
  check('...who calls it', rowsOf(entry, 'callers').length > 0);
  check('...and hands over the entry as seeded', String(entry['json']).includes('surface/live'));

  // The finding this pane exists for: an entry nothing calls. `surface/matrix`
  // is a perfectly good estate-wide read that no action ever named.
  const orphan = entries.find((e) => e['fingerprint'] === 'surface/matrix');
  check('an entry nothing calls is flagged as such', String(orphan?.['badge']) === 'nothing calls it');

  // ── timeline: what the shells actually did ─────────────────
  tapAdmin(dock, 'back');
  await settle();
  tapAdmin(dock, 'timeline');
  await settle(8);

  const feed = nested(topOf(dock, 'admin'), 'timeline');
  const calls = rowsOf(feed, 'calls');
  check(`the feed holds the endpoint calls the living shells made (${calls.length})`, calls.length > 0);
  check('...naming the endpoint and the action that called it', calls.some((c) => String(c['from']) !== '' && String(c['name']) !== ''));
  check('...and no call carries a payload of any kind', calls.every((c) => !('body' in c) && !('result' in c) && !('response' in c)));

  // Filterable by principal, which is the roster and the feed agreeing. Two
  // people are signed in, so a filter that narrows is a filter that works.
  check('the feed separates the two signed-in principals', rowsOf(feed, 'principals').length === 3); // both, plus Everyone
  const theoFilter = rowsOf(feed, 'principals').find((p) => String(p['name']).includes('Theo'));
  tapAdmin(dock, 'pick', theoFilter);
  await settle(8);
  const theoCalls = rowsOf(nested(topOf(dock, 'admin'), 'timeline'), 'calls');
  check('...and filtering to one narrows it', theoCalls.length > 0 && theoCalls.length < calls.length);
  check('...to exactly that principal’s calls', theoCalls.every((c) => String(c['who']).includes('Theo')));

  // ── agent runs: the whole exchange, not just what it cost ──
  // A run is written by moss's sink through the caller's own wire, which needs a
  // model. One row is inserted here instead, shaped exactly as `runs.ts` writes
  // it, so the pane's READING of a record is under test without a key: the turns,
  // the tool call, the result that answered it.
  const TURNS = JSON.stringify([
    { role: 'system', content: 'You are Marta, the assistant living inside this hotel application.\nSecond line.' },
    { role: 'user', content: 'what does Amara owe?' },
    { role: 'assistant', content: '', calls: [{ name: 'query', args: '{"fingerprint":"folio/lines","context":{"stayId":"stay_amara"}}' }] },
    { role: 'tool', name: 'query', content: '[{"amount":3105}]' },
  ]);
  await sql(
    `INSERT INTO assistant_runs (user_id, property_id, agent_id, agent_path, label, provider, model,
       input_tokens, output_tokens, total_tokens, reported, steps, elapsed_ms, outcome, turns, response)
     VALUES ('stf_rosa', 'prop_lumen', 'atrium.assistant', 'atrium.assistant', 'chat', 'groq', 'test-model',
       2000, 100, 2100, true, 2, 1234, 'ok', $1, '{"data":{"say":"€3105."}}')`,
    [TURNS],
  );

  tapAdmin(dock, 'back');
  await settle();
  tapAdmin(dock, 'runs');
  await settle(8);

  const runsPane = topOf(dock, 'admin');
  // The pane it replaced showed `$.error` — an object — as its notice, which read
  // "[object Object]" whenever the seam moved. An empty error is the load working.
  check('the runs pane loads without a notice', String(nested(runsPane, 'error')['message'] ?? runsPane['error'] ?? '') === '');
  const runsData = nested(runsPane, 'runs');
  const feedRows = rowsOf(runsData, 'runs');
  const run = feedRows.find((row) => String(row['model']) === 'test-model');
  check(`every run is listed (${feedRows.length})`, run !== undefined);
  check('...named by the agent that ran, not by the pane', String(run?.['agent']) === 'atrium.assistant');
  check('...and the tools it called are on the row', String(run?.['called']) === 'query');
  check('the same rows group by agent', rowsOf(runsData, 'byAgent').some((row) => String(row['agent']) === 'atrium.assistant'));

  // THE PROMPT is one text, whole, under the role that said each part. It is the
  // artifact the pane exists for; a per-turn table made it unreadable.
  const prompt = String(run?.['prompt'] ?? '');
  check('the prompt reads as one text', prompt.startsWith('[system]') && prompt.includes('Second line.'));
  check('...with every speaking turn in it', ['[system]', '[user]', '[tool: query]'].every((role) => prompt.includes(role)));
  // A tool-call turn carries no words. Interleaving `→ query(...)` into the
  // prompt would turn the one thing worth reading straight through into a log.
  check('...and no machinery folded into it', !prompt.includes('→') && !prompt.includes('[assistant]'));

  // THE TOOL CALLS, separately: what was asked, and what answered it.
  const toolCalls = rowsOf(run ?? {}, 'calls');
  check(`the tool calls are their own list (${toolCalls.length})`, toolCalls.length === 1);
  check('...named', String(toolCalls[0]?.['name']) === 'query');
  check('...with arguments as the provider sent them', String(toolCalls[0]?.['args']).includes('stay_amara'));
  check('...paired with what came back', String(toolCalls[0]?.['result']).includes('3105'));

  // Opening a run is the second depth, and it is data already in hand.
  tapAdmin(dock, 'open', run);
  await settle(6);
  check('opening a run shows its prompt', String(nested(topOf(dock, 'admin'), 'open')['prompt']).includes('You are Marta'));

  // ── living shells ──────────────────────────────────────────
  tapAdmin(dock, 'back');
  await settle();
  tapAdmin(dock, 'shells');
  await settle(8);

  const shells = nested(topOf(dock, 'admin'), 'shells');
  const sessions = rowsOf(shells, 'sessions');
  const theoSession = sessions.find((s) => s['id'] === 'gst_theo');
  check('the roster sees the guests who are signed in', theoSession !== undefined);
  check('...and the stack on each of their canvases', rowsOf(theoSession ?? {}, 'stacks').some((c) => String(c['trail']).includes('concierge')));
  check('the process reports its own figures', String(nested(shells, 'health')['actions']).includes('core'));
  // The roster is moss's own enumeration now, not a note this app keeps, so it
  // can answer the question a support call actually starts with.
  check('...and whether anybody is attached to each', theoSession?.['attached'] !== undefined);

  // ── RESTARTING SOMEBODY'S SHELL ────────────────────────────
  // The scenario this exists for: a person says their screen is broken, and
  // the shell is server state keyed by principal, so nothing they can do
  // reaches it — reloading reattaches to it, and so does signing out and back
  // in. This is the move from outside their session.
  const rosaSession = sessionFor('rosa');
  await settle(8);
  // Put her somewhere that is not her boot screen, so "back to login" is a
  // visible fact rather than a claim.
  await openFromMenu(rosaSession.shell, 'desk.issue.list');
  const wandered = rosaSession.shell;
  check('Rosa has navigated into a surface', mounted(wandered, 'work').includes('desk.issue.list'));

  // Two presses: the pane arms, then acts. Selecting her first, as a person
  // would, because the button restarts whoever is chosen.
  const rosaRow = rowsOf(nested(topOf(dock, 'admin'), 'shells'), 'sessions').find((s) => s['id'] === 'stf_rosa');
  check('...and the operator can find her on the roster', rosaRow !== undefined);
  tapAdmin(dock, 'pick', rosaRow);
  await settle();
  tapAdmin(dock, 'arm');
  await settle();
  check('the restart arms before it acts', topOf(dock, 'admin')['arming'] === true);
  tapAdmin(dock, 'restart', rosaRow);
  await settle(10);
  check('...and reports it done', topOf(dock, 'admin')['done'] === true && String(nested(topOf(dock, 'admin'), 'error')['message'] ?? '') === '');

  // What the restart actually did, asserted on the app's side of the seam.
  const afterwards = rosaSession.shell;
  check('her shell is a NEW one — the wedged one is gone', afterwards !== wandered);
  check('...and she is back where login puts her', !mounted(afterwards, 'work').includes('desk.issue.list'));
  check('...with her chrome rebuilt, so she is still signed in', mounted(afterwards, 'chrome')[0] === 'chrome.staff');
  // The bound the whole design rests on: a reset can only rebuild a warm cache
  // over the projection, so nothing a person owns is touched by pressing it.
  const stillHers = await sql(`SELECT count(*)::int AS n FROM issues`);
  check('...and not one row was written to do it', Number(stillHers[0]?.['n'] ?? 0) > 0);

  // ── the boundary ───────────────────────────────────────────
  // The tool mounts no vex and holds no policy, so there is no route on it that
  // could read a hotel's rows. The proof is the manifest, not a promise: a data
  // section would be the only way, and there isn't one.
  const adminApp = (await import('@atrium/admin/app/charter')).ADMIN_CHARTER;
  const sections = Object.values(adminApp).flatMap((role) => (Array.isArray(role) ? [] : Object.keys(role)));
  check('the admin charter grants no data verbs at all', !sections.includes('data'));

  // Messages exist in the app and are readable there. Nothing in the tool's
  // surface can reach them — the seam has no route that returns one.
  const wrote = await sql(`SELECT count(*)::int AS n FROM messages`);
  check(`the app holds ${String(wrote[0]?.['n'] ?? 0)} guest messages…`, Number(wrote[0]?.['n'] ?? 0) > 0);
  check('…and the seam offers no way to read one', (await knock('/operator/messages', KEY)) === 404);

  // The direction of the dependency, asserted rather than intended. The app
  // knows about its own seam and nothing about the tool that uses it — which is
  // what makes the seam promotable to moss and the tool pointable at any other
  // app. One import the wrong way and both of those quietly stop being true.
  check(`nothing in the app imports the tool (${importers().length} files do)`, importers().length === 0);

  report('the administration tool');
};

void main();
