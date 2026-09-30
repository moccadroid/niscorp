// INTEGRATION CHECK — somebody else's screen, installed live.
//
// Acme (apps/lab/lyceum-vendor-demo) is served here from a local HTTP server —
// at the talk it is a file on GitHub Pages — and lyceum knows it only by its
// address (LYCEUM_VENDOR_URL).
//
//   1. before anything is installed, no phone has Acme;
//   2. the speaker's Integrations tool is on its slide; installing the BROKEN
//      bundle is refused by intake, with the path round its loop, and no phone
//      changes;
//   3. installing Acme is accepted and held as pending — still on no phone;
//   4. approved, each of Acme's screens is on the seat it attached to: the
//      ask on every phone's list, drawn from its own layout; every question
//      on the controller; the fit ones on the last slide;
//   5. a question asked there lands in lyceum's Q&A as the person who asked;
//      the controller shows it with the moderator's verdict — a question not
//      fit to show too, marked so — and the last slide, on the projector,
//      shows the fit one and never the other;
//   6. removed, it is gone again, from every seat.
import { createServer } from 'node:http';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { questionsShown } from '@lyceum/app/vex/question.entries';
import { boot } from '@lyceum/server/boot';
import { ACME_BROKEN_BUNDLE, ACME_BUNDLE } from '../../../lyceum-vendor-demo/src/bundle';
import { check, connect, finish, waitUntil } from './harness';
import type { Terminal } from './harness';

const main = async (): Promise<void> => {
  // Acme's host: two static files, nothing else.
  const vendor = createServer((req, res) => {
    const bundle = req.url === '/vendor/bundle' ? ACME_BUNDLE : req.url === '/vendor-broken/bundle' ? ACME_BROKEN_BUNDLE : undefined;
    res.writeHead(bundle === undefined ? 404 : 200, { 'content-type': 'application/octet-stream' });
    res.end(bundle === undefined ? '' : JSON.stringify(bundle));
  });
  await new Promise<void>((resolve) => vendor.listen(0, '127.0.0.1', resolve));
  const vendorAddress = vendor.address();
  if (vendorAddress === null || typeof vendorAddress === 'string') throw new Error('no vendor port');
  process.env['LYCEUM_VENDOR_URL'] = `http://127.0.0.1:${vendorAddress.port}/vendor`;
  process.env['LYCEUM_VENDOR_BROKEN_URL'] = `http://127.0.0.1:${vendorAddress.port}/vendor-broken`;

  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const join = async (): Promise<Terminal> => {
    const door = await connect(base);
    await door.shows('main', '"ref":"pick"');
    door.click('main', 'pick');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    await phone.hello();
    await phone.shows('body', 'assistant.thread');
    return phone;
  };
  const ada = await join();
  const ben = await join();
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await speaker.hello();
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  await stage.hello();

  // ── 1 ──
  check('before anything is installed, no phone has Acme', !ada.showsNow('body', 'ext.member.acme.ask'));
  check('...nor the controller, nor the projector', !speaker.showsNow('attached', 'ext.speaker.acme') && !stage.showsNow('attached', 'ext.stage.acme'));

  // ── 2 ──
  const at = SLIDES.findIndex((slide) => slide.tools.includes('tools.integrations'));
  check(`the Integrations tool is on a slide (${SLIDES[at]?.title ?? 'none'})`, at >= 0);
  for (let step = 0; step < at; step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 2} of`);
  }
  check('...and it is on the controller there, showing where Acme lives', await speaker.shows('tools', '/vendor'));
  speaker.click('tools', 'broken');
  check('installing the broken bundle is refused', await speaker.shows('tools', '"value":"refused"'));
  check('...by intake, with the path round its loop', await speaker.shows('tools', 'acme-echo —emit (ext.member.acme.ask)→ acme-echo'));
  check('...and for nothing else: the loop is its only fault', !speaker.showsNow('tools', 'no such action'));
  check('the projector shows the same answer, live: refused, and the loop', (await stage.shows('main', '"Refused"')) && (await stage.shows('main', 'acme-echo —emit (ext.member.acme.ask)→ acme-echo')));
  check('...and no phone has it', !ada.showsNow('body', 'ext.member.acme.ask'));

  // ── 3 ──
  speaker.click('tools', 'install');
  check('installing Acme is accepted and pending', await speaker.shows('tools', '"value":"pending"'));
  check('...and so does the projector, the refusal gone', (await stage.shows('main', '"Passed"')) && !stage.showsNow('main', 'acme-echo'));
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('...and still no phone has it', !ada.showsNow('body', 'ext.member.acme.ask'));

  // ── 4 ──
  speaker.click('tools', 'approve');
  check('approved', await speaker.shows('tools', '"value":"approved"'));
  check('...Acme is on the first phone, on its list', await ada.shows('body', 'ext.member.acme.ask'));
  check('...drawn from its own layout', ada.showsNow('body', 'Acme · Ask Anything'));
  check('...and on the second', await ben.shows('body', 'ext.member.acme.ask'));
  check('...every question on the controller, in its own region', await speaker.shows('attached', 'Acme · Every question'));
  check('...and the projector holds the fit ones, for the last slide', await stage.shows('attached', 'ext.stage.acme.questions'));
  check('...a phone has neither: each screen is on its own seat', !ada.showsNow('body', 'ext.speaker.acme') && !ada.showsNow('body', 'ext.stage.acme'));

  // ── 5 ──
  ada.type('body', 'question', 'Who wrote this screen?');
  await new Promise((resolve) => setTimeout(resolve, 200));
  ada.click('body', 'ask');
  check('a question asked in Acme says it went', await ada.shows('body', 'Asked. The speaker has it.'));
  const asked = await runtime.db.query<{ text: string; member_id: string }>("SELECT text, member_id FROM questions WHERE text = 'Who wrote this screen?'");
  const ids = (await runtime.db.query<{ member_id: string }>('SELECT member_id FROM members ORDER BY joined_at, member_id')).rows.map((row) => row.member_id);
  check('...and it is in lyceum’s Q&A, as the person who asked', asked.rows.length === 1 && asked.rows[0]?.member_id === ids[0]);
  check('...and on Acme’s own list of their questions', await ada.shows('body', 'Who wrote this screen?'));
  // The moderator judges it (fit), and then the projector may show it.
  const stageRead = async (): Promise<string> =>
    (await server.request('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await mintSession(runtime.pool, 'stage', 60_000)}` }, body: JSON.stringify({ fingerprint: questionsShown.fingerprint, context: {} }) })).text();
  let seen = '';
  for (let i = 0; i < 100 && !seen.includes('Who wrote this screen?'); i += 1) {
    seen = await stageRead();
    if (!seen.includes('Who wrote this screen?')) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  check('...and, found fit to show, the projector may read it', seen.includes('Who wrote this screen?'));
  check('...on the controller, marked fit to show', await speaker.shows('attached', '"shown":"check"') && speaker.showsNow('attached', 'Who wrote this screen?'));

  // One not fit to show: the controller has it, marked; the projector never.
  ada.type('body', 'question', 'Is the speaker an idiot?');
  await new Promise((resolve) => setTimeout(resolve, 200));
  ada.click('body', 'ask');
  check('a question not fit to show is on the controller too', await speaker.shows('attached', 'Is the speaker an idiot?'));
  check('...marked not fit to show', await speaker.shows('attached', '"shown":"x"'));
  const last = SLIDES.length;
  for (let step = at + 1; step < last; step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 1} of`);
  }
  check('on the last slide, the projector shows Acme’s list', (await stage.shows('main', '"canvasId":"attached"')) && (await stage.shows('attached', 'Who wrote this screen?')));
  check('...and never the question not fit to show', !stage.showsNow('attached', 'idiot') && !stage.showsNow('main', 'idiot'));

  // ── 6 ──
  // Back to the Integrations tool's slide, where Remove is.
  for (let step = last - 1; step > at; step -= 1) {
    speaker.click('controls', 'back');
    await speaker.shows('head', `slide ${step} of`);
  }
  speaker.click('tools', 'remove');
  check('removed: Acme is gone from the first phone', await waitUntil(() => !ada.showsNow('body', 'ext.member.acme.ask')));
  check('...and from the second', await waitUntil(() => !ben.showsNow('body', 'ext.member.acme.ask')));
  check('...and from the controller and the projector', await waitUntil(() => !speaker.showsNow('attached', 'ext.speaker.acme') && !stage.showsNow('attached', 'ext.stage.acme')));

  ada.close();
  ben.close();
  speaker.close();
  stage.close();
  httpServer.close();
  vendor.close();
  await close();
  finish();
};

void main();
