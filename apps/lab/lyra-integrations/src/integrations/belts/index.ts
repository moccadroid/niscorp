import { createHash } from 'node:crypto';
import type { Integration } from '../../integration';
import { BELTS_BUNDLE } from './bundle';
import { BELTS, RANKS, bandsFor, beltView, labelFor, nextRank, ordinal, sinceFor, toneOf } from './store';

// ═══════════════════════════════════════════════════════════════
// BELTS — rank tracking for grappling gyms, as an integration.
//
// Every route here is RELATIVE and every one asks `ctx.identity(c)` with no
// audience argument: the mounting bound this integration's id to both. The nine
// hand-written `/belts/...` paths and nine `identity(c, 'belts')` calls this
// replaces were nine chances to write the wrong string.
// ═══════════════════════════════════════════════════════════════

// ── the second direction: the integration acts as ITSELF ─────
//
// The person driving is in the assertion; the write lands in OUR storage. Then
// this service presents its OWN KEY and leaves a message in Lyra's
// notifications — the studio's inbox learns about the grading without Lyra ever
// growing a belt column. The key and Lyra's address come from the environment;
// absent either, the promotion still stands and the message is simply not sent
// (`notified` says which happened).
const notifyLyra = async (env: (name: string) => string, studioId: string, subject: string): Promise<boolean> => {
  const key = env('BELTS_KEY');
  const base = env('LYRA_BASE').replace(/\/$/, '');
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

const rankRows = (): unknown[] => RANKS.map((r) => ({ name: r.name, tone: r.tone, bands: bandsFor(r.name) }));

export const beltsIntegration: Integration = {
  id: 'belts',
  bundle: () => BELTS_BUNDLE,
  // Named, so they are fenced: this integration cannot read a secret belonging to
  // another one even by knowing its name.
  env: ['BELTS_KEY', 'LYRA_BASE', 'BELTS_HOOK_SECRET'],

  mount: (r, ctx) => {
    r.post('/roster', (c) => {
      // SCOPED BY THE ASSERTION, not by the body. Two gyms can install this and
      // each sees its own — and the caller cannot ask for the other one, because
      // the only place a studio id comes from is a token they cannot mint.
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const rows = BELTS.filter((b) => b.studioId === who.studioId).map((b) => ({
        person_id: b.personId,
        belt: b.belt,
        stripes: b.stripes,
        label: labelFor(b.belt, b.stripes),
        tone: toneOf(b.belt),
        bands: bandsFor(b.belt, b.stripes),
        since: b.since,
      }));
      return c.json(rows);
    });

    r.post('/mine', (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      return c.json(beltView(BELTS.find((b) => b.personId === who.personId)));
    });

    // THE STRIP'S PREVIEW — display atoms for the row that opens the panel: the
    // belt as colors and one line of words. This is what lets the member record
    // SHOW a purple belt without Lyra ever learning what one is.
    r.post('/preview', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { person_id?: unknown };
      const personId = typeof body.person_id === 'string' ? body.person_id : '';
      const held = BELTS.find((b) => b.studioId === who.studioId && b.personId === personId);
      const view = beltView(held);
      return c.json({ bands: view.bands, hint: held === undefined ? 'White' : `${view.label} · since ${view.since}` });
    });

    // The panel's read: about the member the HOST screen handed over, inside the
    // studio the ASSERTION names. The body says which record; the token says which
    // studio may be looked in — asking about another studio's member finds nothing.
    r.post('/member', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { personId?: unknown };
      const personId = typeof body.personId === 'string' ? body.personId : '';
      return c.json(beltView(BELTS.find((b) => b.studioId === who.studioId && b.personId === personId)));
    });

    r.post('/promote', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { personId?: unknown; personName?: unknown };
      const personId = typeof body.personId === 'string' ? body.personId : '';
      const personName = typeof body.personName === 'string' && body.personName !== '' ? body.personName : personId;

      const today = new Date().toISOString().slice(0, 10);
      let held = BELTS.find((b) => b.studioId === who.studioId && b.personId === personId);
      // No record is a white belt, so the first promotion anybody records is to
      // Blue — the White they already were is written into the history with it.
      const to = nextRank(held?.belt ?? 'White');
      if (personId === '' || to === null) return c.json({ message: 'Nothing to promote to.' }, 400);

      if (held === undefined) {
        held = { personId, studioId: who.studioId, belt: to, stripes: 0, since: today, classes: 0, history: [{ belt: to, stripes: 0, on: today }, { belt: 'White', stripes: 0, on: '—' }] };
        BELTS.push(held);
      } else {
        // A promotion RESETS THE BAR: the stripes belonged to the old belt.
        held.belt = to;
        held.stripes = 0;
        held.since = today;
        held.history.unshift({ belt: to, stripes: 0, on: today });
      }

      const notified = await notifyLyra(ctx.env, who.studioId, `${personName} was promoted to ${to}.`);
      return c.json({ ...beltView(held), notified });
    });

    // ── THE STRIPE: an advancement, not a promotion ────────────
    //
    // Up to four per belt, and the fourth is the wall — there is no fifth stripe,
    // and reaching four does not promote anybody: the next step is a decision a
    // coach makes on the mat, recorded with the button above.
    r.post('/stripe', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { personId?: unknown; personName?: unknown };
      const personId = typeof body.personId === 'string' ? body.personId : '';
      const personName = typeof body.personName === 'string' && body.personName !== '' ? body.personName : personId;
      if (personId === '') return c.json({ message: 'Name the member.' }, 400);

      const today = new Date().toISOString().slice(0, 10);
      let held = BELTS.find((b) => b.studioId === who.studioId && b.personId === personId);
      if (held !== undefined && held.stripes >= 4) {
        return c.json({ message: 'Four stripes is as far as a belt goes — the next step is a promotion.' }, 400);
      }

      if (held === undefined) {
        // A white belt earning their first stripe is what mints the record.
        held = { personId, studioId: who.studioId, belt: 'White', stripes: 1, since: today, classes: 0, history: [{ belt: 'White', stripes: 1, on: today }] };
        BELTS.push(held);
      } else {
        held.stripes += 1;
        held.history.unshift({ belt: held.belt, stripes: held.stripes, on: today });
      }

      const notified = await notifyLyra(ctx.env, who.studioId, `${personName} earned their ${ordinal(held.stripes)} stripe on ${held.belt}.`);
      return c.json({ ...beltView(held), notified });
    });

    // ── UNDO: the ledger wound back one step ───────────────────
    //
    // Every edit here is an EVENT on the history, so reversing one is not a
    // special case per verb — pop the newest event and the record becomes
    // whatever the ledger then says. A promotion comes back off, a stripe comes
    // back off, and when the last event goes, the record goes with it: back to
    // the white-belt floor, exactly as if nothing had ever been written. The
    // correction is announced to the studio's inbox like the edit was — an undone
    // mistake is still a thing that happened at the desk.
    r.post('/undo', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { personId?: unknown; personName?: unknown };
      const personId = typeof body.personId === 'string' ? body.personId : '';
      const personName = typeof body.personName === 'string' && body.personName !== '' ? body.personName : personId;

      const at = BELTS.findIndex((b) => b.studioId === who.studioId && b.personId === personId);
      const held = at === -1 ? undefined : BELTS[at];
      if (held === undefined || held.history.length === 0) return c.json({ message: 'Nothing to undo.' }, 400);

      held.history.shift();
      const head = held.history[0];
      if (head === undefined) {
        BELTS.splice(at, 1);
        const notified = await notifyLyra(ctx.env, who.studioId, `Correction: ${personName}'s belt record was cleared — back to White.`);
        return c.json({ ...beltView(undefined), notified });
      }

      held.belt = head.belt;
      held.stripes = head.stripes;
      held.since = sinceFor(held.history);
      const notified = await notifyLyra(ctx.env, who.studioId, `Correction: ${personName} is back to ${labelFor(head.belt, head.stripes)}.`);
      return c.json({ ...beltView(held), notified });
    });

    // ── the settings door's two endpoints ──────────────────────
    r.post('/ranks', (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      return c.json(rankRows());
    });

    r.post('/ranks/add', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name === '') return c.json({ message: 'Name the rank.' }, 400);
      if (RANKS.some((r2) => r2.name.toLowerCase() === name.toLowerCase())) return c.json({ message: 'That rank exists.' }, 400);
      // A rank added by name gets a neutral body until somebody teaches the
      // settings screen about color pickers. Honest gray, not a guess.
      RANKS.push({ name, tone: 'stone', color: '#8a8f98' });
      return c.json(rankRows());
    });

    // ── A FRAMED PAGE, from this side ──────────────────────────
    //
    // The integration serves HTML and the host frames it. Belts does not need this —
    // its screens are ordinary nova layouts, which is the right way — so what
    // this exists to prove is the SEAM: that a declared page is reachable only
    // through a grant, that the assertion still arrives, and that the host
    // renders a document it never validated.
    //
    // SELF-CONTAINED, deliberately. Relative subresources would resolve against
    // the HOST's origin and arrive at the proxy with no session, so a framed
    // page loads nothing of its own — everything inline, and anything external
    // (a vendor's SDK) straight from the vendor.
    r.get('/embed/summary', (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.html('<!doctype html><title>Belts</title><p>Who are you?</p>', 401);
      const rows = BELTS.filter((b) => b.studioId === who.studioId)
        .map((b) => `<li><span class="bar" style="background:${RANKS.find((r2) => r2.name === b.belt)?.color ?? '#888'}"></span>${labelFor(b.belt, b.stripes)}</li>`)
        .join('');
      return c.html(`<!doctype html>
<html><head><meta charset="utf-8"><title>Belts</title><style>
  body { margin:0; font: 14px/1.5 system-ui, sans-serif; color: #1b1b1f; background: transparent; }
  ul { list-style:none; margin:0; padding:0 }
  li { display:flex; align-items:center; gap:10px; padding:8px 0 }
  .bar { width:26px; height:10px; border-radius:2px; display:inline-block }
</style></head>
<body>
  <ul>${rows === '' ? '<li>Nobody graded yet.</li>' : rows}</ul>
  <script>
    // THE HEIGHT HANDSHAKE, the integration's half. The host cannot know how tall this
    // is, so the page says — and keeps saying, because content moves.
    var tell = function () {
      parent.postMessage({ type: 'frame:height', height: document.documentElement.scrollHeight }, '*');
    };
    tell();
    if (window.ResizeObserver) new ResizeObserver(tell).observe(document.body);
  </script>
</body></html>`);
    });

    // A checkable statement about the tenancy rule above, without a running Lyra.
    //
    // NOT DECLARED in the bundle, on purpose: it is the undeclared route the
    // host's allow-list must refuse (integrations-check). An integration always has one
    // of these; the point is that having one costs the host nothing.
    r.get('/_selftest', (c) => {
      const north = BELTS.filter((b) => b.studioId === 'st_northrock').length;
      const lumen = BELTS.filter((b) => b.studioId === 'st_lumen').length;
      return c.json({ north, lumen });
    });
  },

  // ── THE WEBHOOK DOOR, from this side ─────────────────────────
  //
  // Nothing signs anything to Belts — it has no vendor. This holds the SHAPE
  // Stripe's will need, and is checkable now.
  //
  // The context here has NO `identity` — not "unset", absent from the type. The
  // host mints no assertion on this path, so there is nobody to be, and
  // authenticating the caller is this handler's own job against a secret only it
  // and the vendor hold.
  //
  // It answers with what it received, byte for byte, because the one property
  // that cannot be checked from outside is whether the body survived the trip
  // unparsed — and a signature over re-serialized JSON fails for reasons nobody
  // enjoys finding.
  hooks: (r, ctx) => {
    r.post('/:event', async (c) => {
      const raw = Buffer.from(await c.req.arrayBuffer());
      const digest = createHash('sha256').update(raw).digest('hex');
      const received = { event: c.req.param('event'), bytes: raw.length, sha256: digest };

      const secret = ctx.env('BELTS_HOOK_SECRET');
      const offered = c.req.header('x-belts-signature') ?? '';
      const expected = secret === '' ? '' : createHash('sha256').update(secret).update(raw).digest('hex');
      // Unsigned, wrongly signed, and "this deployment holds no secret" are one
      // answer: we do not know who you are. The body is echoed either way — it
      // is not a secret, it is what the caller just sent us.
      if (expected === '' || offered !== expected) return c.json({ message: 'Who are you?', ...received }, 401);
      return c.json({ ok: true, ...received });
    });
  },
};
