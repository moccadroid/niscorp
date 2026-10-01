// BUTTON CHECK — an action only some people have.
//
//   1. before it is given, nobody's phone has the button;
//   2. the speaker's tool is on the button's slide; Give picks three of the
//      five who joined and writes a grant each — the button is on exactly
//      three phones' lists, and the other two were never sent it;
//   3. somebody who has it presses: the stage shows their name;
//   4. somebody who does not have it cannot press by replaying the write —
//      the engine refuses, whatever their screen was sent;
//   5. Take it back: it is gone from every phone.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import { SLIDES } from '@lyceum/db/seed';
import { pressSend } from '@lyceum/app/vex/press.entries';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';
import type { Terminal } from './harness';

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;

  const join = async (): Promise<{ phone: Terminal; token: string }> => {
    const door = await connect(base);
    await door.shows('main', '"ref":"pick"');
    door.click('main', 'pick');
    const token = await door.session();
    door.close();
    const phone = await connect(base, token);
    await phone.hello();
    await phone.shows('main', '"canvasId":"body"');
    return { phone, token };
  };
  const people = [await join(), await join(), await join(), await join(), await join()];
  const speaker = await connect(base, await mintSession(runtime.pool, 'speaker', 60_000));
  await speaker.hello();
  const stage = await connect(base, await mintSession(runtime.pool, 'stage', 60_000));
  await stage.hello();
  const has = (person: { phone: Terminal }): boolean => person.phone.showsNow('body', 'button.press');
  const press = async (token: string): Promise<number> =>
    (await server.request('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ fingerprint: pressSend.fingerprint, context: {} }) })).status;

  // ── 1 ──
  check('before it is given, nobody’s phone has the button', people.every((person) => !has(person)));

  // ── 2 ──
  const at = SLIDES.findIndex((slide) => slide.tools.includes('tools.button'));
  check(`the button tool is on a slide (${SLIDES[at]?.title ?? 'none'})`, at >= 0);
  for (let step = 0; step < at; step += 1) {
    speaker.click('controls', 'next');
    await speaker.shows('head', `slide ${step + 2} of`);
  }
  check('...and it is on the controller there', await speaker.shows('tools', 'Give it to three people'));
  await speaker.shows('tools', 'People who have it');
  await new Promise((resolve) => setTimeout(resolve, 300));
  speaker.click('tools', 'give');
  check('pressing Give: the tool counts three', await speaker.shows('tools', '"label":"People who have it","value":3'));
  check('...the button is on exactly three of the five phones', await waitUntil(() => people.filter(has).length === 3));
  const holders = people.filter(has);
  const others = people.filter((person) => !has(person));
  check('...and the other two were never sent it', others.length === 2 && others.every((person) => !person.phone.textOf('body').includes('button') && !person.phone.textOf('main').includes('button.press')));

  // ── 3 ──
  const presser = holders[0];
  if (presser === undefined) throw new Error('nobody has the button');
  presser.phone.click('body', 'press');
  const pressers = async (): Promise<string[]> => (await runtime.db.query<{ name: string }>('SELECT m.name FROM presses p JOIN members m USING (member_id)')).rows.map((row) => row.name);
  let names = await pressers();
  for (let i = 0; i < 100 && names.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    names = await pressers();
  }
  const presserName = names[0] ?? '';
  check(`somebody who has it presses: one press is recorded, in their name (${presserName})`, names.length === 1 && presserName !== '');
  check('...and the stage shows who pressed', await stage.shows('main', presserName));

  // ── 4 ──
  const outsider = others[0];
  if (outsider === undefined) throw new Error('everybody has the button');
  const refused = await press(outsider.token);
  check(`somebody who does not have it cannot press by replaying the write (${refused})`, refused >= 400 && (await runtime.db.query('SELECT 1 FROM presses')).rows.length === 1);

  // ── 5 ──
  speaker.click('tools', 'take');
  check('Take it back: gone from every phone', await waitUntil(() => people.every((person) => !has(person))));
  check('...and the tool counts none', await speaker.shows('tools', '"label":"People who have it","value":0'));

  for (const person of people) person.phone.close();
  speaker.close();
  stage.close();
  httpServer.close();
  await close();
  finish();
};

void main();
