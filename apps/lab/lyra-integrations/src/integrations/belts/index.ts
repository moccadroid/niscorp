import { createHash } from 'node:crypto';
import type { Integration } from '../../integration';
import { BELTS_BUNDLE } from './bundle';
import { BELTS, RANKS, bandsFor, beltView, labelFor, nextRank, ordinal, sinceFor, toneOf } from './store';

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
  env: ['BELTS_KEY', 'LYRA_BASE', 'BELTS_HOOK_SECRET'],

  mount: (r, ctx) => {
    r.post('/roster', (c) => {
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

    r.post('/preview', async (c) => {
      const who = ctx.identity(c);
      if (who === undefined) return c.json({ message: 'Who are you?' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { person_id?: unknown };
      const personId = typeof body.person_id === 'string' ? body.person_id : '';
      const held = BELTS.find((b) => b.studioId === who.studioId && b.personId === personId);
      const view = beltView(held);
      return c.json({ bands: view.bands, hint: held === undefined ? 'White' : `${view.label} · since ${view.since}` });
    });

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
      const to = nextRank(held?.belt ?? 'White');
      if (personId === '' || to === null) return c.json({ message: 'Nothing to promote to.' }, 400);

      if (held === undefined) {
        held = { personId, studioId: who.studioId, belt: to, stripes: 0, since: today, classes: 0, history: [{ belt: to, stripes: 0, on: today }, { belt: 'White', stripes: 0, on: '—' }] };
        BELTS.push(held);
      } else {
        held.belt = to;
        held.stripes = 0;
        held.since = today;
        held.history.unshift({ belt: to, stripes: 0, on: today });
      }

      const notified = await notifyLyra(ctx.env, who.studioId, `${personName} was promoted to ${to}.`);
      return c.json({ ...beltView(held), notified });
    });

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
        held = { personId, studioId: who.studioId, belt: 'White', stripes: 1, since: today, classes: 0, history: [{ belt: 'White', stripes: 1, on: today }] };
        BELTS.push(held);
      } else {
        held.stripes += 1;
        held.history.unshift({ belt: held.belt, stripes: held.stripes, on: today });
      }

      const notified = await notifyLyra(ctx.env, who.studioId, `${personName} earned their ${ordinal(held.stripes)} stripe on ${held.belt}.`);
      return c.json({ ...beltView(held), notified });
    });

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
      RANKS.push({ name, tone: 'stone', color: '#8a8f98' });
      return c.json(rankRows());
    });

    // Not declared in the bundle on purpose: it is the undeclared route the
    // host's allow-list must refuse.
    r.get('/_selftest', (c) => {
      const north = BELTS.filter((b) => b.studioId === 'st_northrock').length;
      const lumen = BELTS.filter((b) => b.studioId === 'st_lumen').length;
      return c.json({ north, lumen });
    });
  },

  // Belts has no vendor. The hook answers with a digest of the bytes it
  // received, because a signature over re-serialized JSON fails.
  hooks: (r, ctx) => {
    r.post('/:event', async (c) => {
      const raw = Buffer.from(await c.req.arrayBuffer());
      const digest = createHash('sha256').update(raw).digest('hex');
      const received = { event: c.req.param('event'), bytes: raw.length, sha256: digest };

      const secret = ctx.env('BELTS_HOOK_SECRET');
      const offered = c.req.header('x-belts-signature') ?? '';
      const expected = secret === '' ? '' : createHash('sha256').update(secret).update(raw).digest('hex');
      if (expected === '' || offered !== expected) return c.json({ message: 'Who are you?', ...received }, 401);
      return c.json({ ok: true, ...received });
    });
  },
};
