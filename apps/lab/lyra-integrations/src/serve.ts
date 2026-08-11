// .env first — LYRA_VERIFY_KEY lives there: the deployment's PUBLIC verify
// key, read off `GET /api/integrations/verify-key` on the lyra this serves.
// Not a secret — holding it only verifies — but without it this service can
// trust no identity claim, so it refuses every identity-bearing request, which
// is the correct default and a confusing one to debug if the file is never read.
try {
  process.loadEnvFile();
} catch {
  /* no .env present — identity routes refuse everything, deliberately */
}

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { BELTS_BUNDLE } from './belts/bundle';

// THE INTEGRATIONS SERVICE.
//
// A separate process with its own storage. It shares no code with Lyra — the
// only dependency is `@niscorp/nova`, for the shape of an action, which is a
// protocol library and not somebody else's application.
//
// It serves two things:
//
//   GET  /<id>/bundle   what it ships. Lyra fetches this when told to.
//   POST /<id>/*        its own API, reached through Lyra's proxy.
//
// Identity arrives INSIDE A SIGNED ASSERTION on the second kind — a bearer
// token moss mints per request, carrying the principal, the scope values from
// the same resolver vex uses for `$scope`, and an expiry seconds out. The body
// is whatever the browser sent and is not trusted for identity — reading
// `studio_id` out of it would put back the hole the assertion exists to close.

const app = new Hono();

// ── the storage this service brings with it ──────────────────
//
// In-memory here because it is a lab; a real one would have a database. What
// matters is that it is NOT Lyra's: rows are keyed by the membership id handed
// over at the wire, and Lyra has no column for any of this.
//
// RANKS are configuration — the pack's own settings screen edits them, which
// is what a settings screen IS: rows in the pack's storage, never Lyra's.
//
// A rank carries its COLOR, because what a belt looks like is this pack's
// domain knowledge: Lyra's kit knows how to paint colored bands, never what a
// grappling belt is. `bandsFor` is the whole tradition in one line — the belt
// body with the rank bar near the end (color·color·color·bar·color), the bar
// black on every belt and RED on the black belt, exactly as a gym would tie it.
type Rank = { name: string; tone: string; color: string };
// A RANK IS AN IDENTITY. These carried status tones — brown was 'alert', black
// was 'good' — so the pack was telling the host app that a brown belt is a
// problem and a black belt is a success. The bands are the real colour; the
// token is only for a badge, and it names a hue now.
const RANKS: Rank[] = [
  { name: 'White', tone: 'stone', color: '#e9e7e2' },
  { name: 'Blue', tone: 'sky', color: '#2458d6' },
  { name: 'Purple', tone: 'violet', color: '#6d3bbf' },
  { name: 'Brown', tone: 'amber', color: '#6b4226' },
  { name: 'Black', tone: 'stone', color: '#141416' },
];
const BAR = '#141416';
const BLACK_BELT_BAR = '#b3261e';
const TAPE = '#f5f5f4';
// The belt as a gym would tie it: the body, then the rank bar — twice as wide
// as a body segment so the tape reads — carrying up to four stripes, then the
// tail. Black belts wear the red bar; their stripes are degrees.
export const bandsFor = (belt: string, stripes = 0): unknown[] => {
  const rank = RANKS.find((r) => r.name === belt);
  if (rank === undefined) return [];
  const bar = belt === 'Black' ? BLACK_BELT_BAR : BAR;
  return [rank.color, rank.color, rank.color, { color: bar, w: 2, ticks: Math.max(0, Math.min(4, stripes)), tickColor: TAPE }, rank.color];
};
const toneOf = (belt: string): string => RANKS.find((r) => r.name === belt)?.tone ?? 'neutral';
const nextRank = (belt: string): string | null => {
  const at = RANKS.findIndex((r) => r.name === belt);
  if (at === -1) return RANKS[0]?.name ?? null;
  return RANKS[at + 1]?.name ?? null;
};
const ordinal = (n: number): string => ['', '1st', '2nd', '3rd', '4th'][n] ?? `${n}th`;
const labelFor = (belt: string, stripes: number): string => (stripes > 0 ? `${belt} — ${ordinal(stripes)} stripe` : belt);

// STRIPES ARE STATE, PROMOTIONS ARE EVENTS. A record holds where somebody is
// (belt + 0..4 stripes); the history holds every moment that moved them —
// gradings AND stripe advancements, each with the belt as it looked that day.
type BeltEvent = { belt: string; stripes: number; on: string };
type BeltRecord = { membershipId: string; studioId: string; belt: string; stripes: number; since: string; classes: number; history: BeltEvent[] };

const BELTS: BeltRecord[] = [
  {
    membershipId: 'mb_omar', studioId: 'st_northrock', belt: 'Purple', stripes: 2, since: '2024-11-02', classes: 412,
    history: [
      { belt: 'Purple', stripes: 2, on: '2026-02-14' },
      { belt: 'Purple', stripes: 1, on: '2025-06-01' },
      { belt: 'Purple', stripes: 0, on: '2024-11-02' },
      { belt: 'Blue', stripes: 0, on: '2022-03-19' },
      { belt: 'White', stripes: 0, on: '2019-09-01' },
    ],
  },
  {
    membershipId: 'mb_nina', studioId: 'st_northrock', belt: 'Blue', stripes: 1, since: '2025-06-14', classes: 188,
    history: [
      { belt: 'Blue', stripes: 1, on: '2026-04-03' },
      { belt: 'Blue', stripes: 0, on: '2025-06-14' },
      { belt: 'White', stripes: 0, on: '2023-01-11' },
    ],
  },
  {
    membershipId: 'mb_ruben', studioId: 'st_northrock', belt: 'White', stripes: 3, since: '2026-05-06', classes: 31,
    history: [
      { belt: 'White', stripes: 3, on: '2026-08-01' },
      { belt: 'White', stripes: 2, on: '2026-07-04' },
      { belt: 'White', stripes: 1, on: '2026-06-06' },
      { belt: 'White', stripes: 0, on: '2026-05-06' },
    ],
  },
];

// THERE IS NO UNRANKED. Walking onto the mat is walking on as a white belt —
// a member with no record here IS a white belt with no stripes, and the first
// stripe or promotion is what mints the row.
//
// The answer every belt-shaped endpoint gives: where they are, what is next,
// whether a stripe can still be added (four is the wall), and every belt —
// current and historical — travelling with its `bands`, so a screen paints it
// without knowing what one is.
const beltView = (held: BeltRecord | undefined) => {
  const belt = held?.belt ?? 'White';
  const stripes = held?.stripes ?? 0;
  const history = held?.history ?? [];
  const prior = history[1];
  return {
    belt,
    stripes,
    label: labelFor(belt, stripes),
    bands: bandsFor(belt, stripes),
    since: held?.since ?? '—',
    classes: held?.classes ?? 0,
    next: nextRank(belt),
    can_stripe: stripes < 4,
    // The words the panel's confirmations speak, authored here beside the
    // rules they describe — a screen should never do rank arithmetic.
    next_stripe: stripes < 4 ? ordinal(stripes + 1) : '',
    // EVERY EDIT IS REVERSIBLE, because the history is a ledger: undo pops the
    // newest event and the record becomes whatever the ledger then says —
    // all the way down to the white-belt floor.
    can_undo: history.length > 0,
    undo_label: prior === undefined ? 'White' : labelFor(prior.belt, prior.stripes),
    history: history.map((entry) => ({ label: labelFor(entry.belt, entry.stripes), on: entry.on, bands: bandsFor(entry.belt, entry.stripes) })),
  };
};

// The current belt's start date, read off the ledger: the OLDEST entry of the
// newest-first run that still wears this belt is the day it was tied on.
const sinceFor = (history: BeltEvent[]): string => {
  const current = history[0];
  if (current === undefined) return '—';
  let on = current.on;
  for (const entry of history) {
    if (entry.belt !== current.belt) break;
    on = entry.on;
  }
  return on;
};

// ── WHO IS CALLING — and there is only one way to answer ─────
//
// The token is two base64url parts: a JSON payload, then an ed25519 signature
// over exactly those payload bytes, made by the deployment whose public key
// sits in this service's environment. That is the whole wire contract, and
// these lines are deliberately NOT imported from Lyra's workspace: an
// integration in its own repository writes them against its own runtime's
// crypto, and the contract is the token format, not anybody's function.
//
// Identity is READABLE ONLY THROUGH THIS. There is no header fallback and no
// second path — a route that wants to know who is calling has to verify, so
// forgetting a guard cannot open anything: an unverified request has no
// identity to scope by. The day the port is public (a webhook, a vendor
// dashboard), a forged claim is not "refused", it is meaningless.
//
// READ PER REQUEST, not at import: an operator pastes the value and restarts,
// and a check sets it after boot without restarting a process it holds.
const verifyKey = (): string => process.env['LYRA_VERIFY_KEY'] ?? '';

type Identity = { principal: string; studioId: string; membershipId: string };

const fromB64url = (text: string): Buffer => Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

const identity = (c: { req: { header: (name: string) => string | undefined } }, integration: string): Identity | undefined => {
  const keyB64 = verifyKey();
  if (keyB64 === '') return undefined;
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
  const dot = token.indexOf('.');
  if (dot <= 0) return undefined;
  try {
    const body = fromB64url(token.slice(0, dot));
    const signature = fromB64url(token.slice(dot + 1));
    const key = createPublicKey({ key: fromB64url(keyB64), format: 'der', type: 'spki' });
    if (!cryptoVerify(null, body, key, signature)) return undefined;
    const parsed = JSON.parse(body.toString()) as { integration?: unknown; principal?: unknown; scope?: Record<string, unknown>; exp?: unknown };
    // Expired is invalid — a token lives seconds, and one that leaked into a
    // log is not a credential a minute later.
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return undefined;
    // FOR US, not just BY them. A token minted for another integration on the
    // same deployment is somebody replaying credentials sideways.
    if (parsed.integration !== integration || typeof parsed.principal !== 'string') return undefined;
    const scope = parsed.scope ?? {};
    return {
      principal: parsed.principal,
      studioId: String(scope['studioId'] ?? ''),
      membershipId: String(scope['membershipId'] ?? ''),
    };
  } catch {
    return undefined;
  }
};

// ── what it ships ────────────────────────────────────────────
//
// OPEN, and it has to be: moss fetches this at registration, before the
// deployment's verify key has ever reached this environment. Nothing in it
// belongs to a studio — it is actions and layouts, which is what this service
// publishes about itself.
app.get('/belts/bundle', (c) => c.json(BELTS_BUNDLE));
app.get('/broken/bundle', (c) => c.json(BROKEN_BUNDLE));

// ── its own API ──────────────────────────────────────────────
app.post('/belts/roster', (c) => {
  // SCOPED BY THE ASSERTION, not by the body. Two gyms can install this and
  // each sees its own — and the caller cannot ask for the other one, because
  // the only place a studio id comes from is a token they cannot mint.
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  const rows = BELTS.filter((b) => b.studioId === who.studioId).map((b) => ({
    membership_id: b.membershipId,
    belt: b.belt,
    stripes: b.stripes,
    label: labelFor(b.belt, b.stripes),
    tone: toneOf(b.belt),
    bands: bandsFor(b.belt, b.stripes),
    since: b.since,
  }));
  return c.json(rows);
});

app.post('/belts/mine', (c) => {
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  return c.json(beltView(BELTS.find((b) => b.membershipId === who.membershipId)));
});

// THE STRIP'S PREVIEW — display atoms for the row that opens the panel: the
// belt as colors and one line of words. This is what lets the member record
// SHOW a purple belt without Lyra ever learning what one is.
app.post('/belts/preview', async (c) => {
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { membership_id?: unknown };
  const membershipId = typeof body.membership_id === 'string' ? body.membership_id : '';
  const held = BELTS.find((b) => b.studioId === who.studioId && b.membershipId === membershipId);
  const view = beltView(held);
  return c.json({
    bands: view.bands,
    hint: held === undefined ? 'White' : `${view.label} · since ${view.since}`,
  });
});

// The panel's read: about the member the HOST screen handed over, inside the
// studio the ASSERTION names. The body says which record; the token says which
// studio may be looked in — asking about another studio's member finds nothing.
app.post('/belts/member', async (c) => {
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { membershipId?: unknown };
  const membershipId = typeof body.membershipId === 'string' ? body.membershipId : '';
  return c.json(beltView(BELTS.find((b) => b.studioId === who.studioId && b.membershipId === membershipId)));
});

// ── PROMOTE: the write, and then the pack acts as itself ─────
//
// The person driving is in the assertion; the write lands in OUR storage. And
// then the second direction fires: this service presents ITS OWN KEY and
// leaves a message in Lyra's notifications — the studio's inbox learns about
// the grading without Lyra ever growing a belt column. The key and Lyra's
// address come from the environment; absent either, the promotion still
// stands and the message is simply not sent (`notified` says which happened).
const notifyLyra = async (studioId: string, subject: string): Promise<boolean> => {
  const key = process.env['BELTS_KEY'] ?? '';
  const base = (process.env['LYRA_BASE'] ?? '').replace(/\/$/, '');
  if (key === '' || base === '') return false;
  try {
    const response = await fetch(`${base}/api/automation/vex`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-nisc-acts-for': studioId },
      body: JSON.stringify({
        fingerprint: 'automation/notify',
        context: { personId: null, kind: 'integration', subject, body: 'Recorded by Belts.' },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

app.post('/belts/promote', async (c) => {
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { membershipId?: unknown; personName?: unknown };
  const membershipId = typeof body.membershipId === 'string' ? body.membershipId : '';
  const personName = typeof body.personName === 'string' && body.personName !== '' ? body.personName : membershipId;

  const today = new Date().toISOString().slice(0, 10);
  let held = BELTS.find((b) => b.studioId === who.studioId && b.membershipId === membershipId);
  // No record is a white belt, so the first promotion anybody records is to
  // Blue — the White they already were is written into the history with it.
  const to = nextRank(held?.belt ?? 'White');
  if (membershipId === '' || to === null) return c.json({ message: 'Nothing to promote to.' }, 400);

  if (held === undefined) {
    held = { membershipId, studioId: who.studioId, belt: to, stripes: 0, since: today, classes: 0, history: [{ belt: to, stripes: 0, on: today }, { belt: 'White', stripes: 0, on: '—' }] };
    BELTS.push(held);
  } else {
    // A promotion RESETS THE BAR: the stripes belonged to the old belt.
    held.belt = to;
    held.stripes = 0;
    held.since = today;
    held.history.unshift({ belt: to, stripes: 0, on: today });
  }

  const notified = await notifyLyra(who.studioId, `${personName} was promoted to ${to}.`);
  return c.json({ ...beltView(held), notified });
});

// ── THE STRIPE: an advancement, not a promotion ──────────────
//
// Up to four per belt, and the fourth is the wall — there is no fifth stripe,
// and reaching four does not promote anybody: the next step is a decision a
// coach makes on the mat, recorded with the button above.
app.post('/belts/stripe', async (c) => {
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { membershipId?: unknown; personName?: unknown };
  const membershipId = typeof body.membershipId === 'string' ? body.membershipId : '';
  const personName = typeof body.personName === 'string' && body.personName !== '' ? body.personName : membershipId;
  if (membershipId === '') return c.json({ message: 'Name the member.' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  let held = BELTS.find((b) => b.studioId === who.studioId && b.membershipId === membershipId);
  if (held !== undefined && held.stripes >= 4) {
    return c.json({ message: 'Four stripes is as far as a belt goes — the next step is a promotion.' }, 400);
  }

  if (held === undefined) {
    // A white belt earning their first stripe is what mints the record.
    held = { membershipId, studioId: who.studioId, belt: 'White', stripes: 1, since: today, classes: 0, history: [{ belt: 'White', stripes: 1, on: today }] };
    BELTS.push(held);
  } else {
    held.stripes += 1;
    held.history.unshift({ belt: held.belt, stripes: held.stripes, on: today });
  }

  const notified = await notifyLyra(who.studioId, `${personName} earned their ${ordinal(held.stripes)} stripe on ${held.belt}.`);
  return c.json({ ...beltView(held), notified });
});

// ── UNDO: the ledger wound back one step ─────────────────────
//
// Every edit here is an EVENT on the history, so reversing one is not a
// special case per verb — pop the newest event and the record becomes
// whatever the ledger then says. A promotion comes back off, a stripe comes
// back off, and when the last event goes, the record goes with it: back to
// the white-belt floor, exactly as if nothing had ever been written. The
// correction is announced to the studio's inbox like the edit was — an undone
// mistake is still a thing that happened at the desk.
app.post('/belts/undo', async (c) => {
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { membershipId?: unknown; personName?: unknown };
  const membershipId = typeof body.membershipId === 'string' ? body.membershipId : '';
  const personName = typeof body.personName === 'string' && body.personName !== '' ? body.personName : membershipId;

  const at = BELTS.findIndex((b) => b.studioId === who.studioId && b.membershipId === membershipId);
  const held = at === -1 ? undefined : BELTS[at];
  if (held === undefined || held.history.length === 0) return c.json({ message: 'Nothing to undo.' }, 400);

  held.history.shift();
  const head = held.history[0];
  if (head === undefined) {
    BELTS.splice(at, 1);
    const notified = await notifyLyra(who.studioId, `Correction: ${personName}'s belt record was cleared — back to White.`);
    return c.json({ ...beltView(undefined), notified });
  }

  held.belt = head.belt;
  held.stripes = head.stripes;
  held.since = sinceFor(held.history);
  const notified = await notifyLyra(who.studioId, `Correction: ${personName} is back to ${labelFor(head.belt, head.stripes)}.`);
  return c.json({ ...beltView(held), notified });
});

// ── the settings door's two endpoints ────────────────────────
const rankRows = (): unknown[] => RANKS.map((r) => ({ name: r.name, tone: r.tone, bands: bandsFor(r.name) }));

app.post('/belts/ranks', (c) => {
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  return c.json(rankRows());
});

app.post('/belts/ranks/add', async (c) => {
  const who = identity(c, 'belts');
  if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name === '') return c.json({ message: 'Name the rank.' }, 400);
  if (RANKS.some((r) => r.name.toLowerCase() === name.toLowerCase())) return c.json({ message: 'That rank exists.' }, 400);
  // A rank added by name gets a neutral body until somebody teaches the
  // settings screen about color pickers. Honest gray, not a guess.
  RANKS.push({ name, tone: 'stone', color: '#8a8f98' });
  return c.json(rankRows());
});

// A DELIBERATELY BROKEN BUNDLE, served on purpose.
//
// Intake is the only thing standing between a mistake here and a corrupted
// application over there, and a gate nobody has watched refuse anything is a
// gate nobody knows the shape of. This one claims a namespace it does not own,
// names a component that does not exist, and calls a fingerprint the app does
// not serve — three refusals in one payload.
const BROKEN_BUNDLE = {
    integration: 'broken',
    grants: { actions: [], data: [] },
    actions: {
      'ext.desk.belts.stolen': {
        id: 'ext.desk.belts.stolen',
        title: 'Not mine',
        data: {},
        layout: { component: 'Teleporter', props: {} },
        endpoints: { x: { url: '/api/member/vex', method: 'POST', request: { fingerprint: 'nothing/here' }, target: 'x' } },
      },
    },
  };

// A checkable statement about the tenancy rule above, without a running Lyra.
app.get('/belts/_selftest', (c) => {
  const north = BELTS.filter((b) => b.studioId === 'st_northrock').length;
  const lumen = BELTS.filter((b) => b.studioId === 'st_lumen').length;
  return c.json({ north, lumen });
});

// THE PORT IS AN ARGUMENT, and read lazily when it is not given.
//
// It was a module-level constant, so a check importing this file could not
// choose one — and every check that started the service therefore fought the
// service already running for development. The visible result was a screen
// reporting 'the service did not answer with a bundle', over and over, because
// running the suite had killed it.
//
// A check takes its own port now and the two never meet.
const defaultPort = (): number => Number(process.env['INTEGRATIONS_PORT'] ?? 8799);

export const startIntegrations = (at?: number): { close: () => Promise<void>; port: number } => {
  const port = at ?? defaultPort();
  const server = serve({ fetch: app.fetch, port });
  // CLOSED AND AWAITED, not left to the process teardown. A listening socket
  // torn down by `process.exit` trips a libuv assertion on Windows and aborts
  // with 127 — which a check runner reads as a failure, after the check has
  // already printed that it passed.
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        // `closeAllConnections` first: `close` alone waits for keep-alive sockets
        // the fetch left open, and the handle is still mid-teardown when the
        // caller exits. The extra tick lets libuv finish before that happens.
        (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
        server.close(() => setTimeout(resolve, 25));
      }),
  };
};

export { app as integrationsApp };

// STARTS WHEN RUN, not only when a flag says so. The flag existed so that a
// check importing this file did not accidentally bind a port — which is no
// longer a risk, because a check passes its own. Requiring it meant the launch
// config had to remember an environment variable to start a server, and it did
// not, so the service was never running when anybody looked.
if (process.argv[1]?.includes('serve') === true || process.env['INTEGRATIONS_STANDALONE'] === '1') {
  const running = startIntegrations();
  console.log(`[lyra-integrations] listening on ${running.port}`);
}
