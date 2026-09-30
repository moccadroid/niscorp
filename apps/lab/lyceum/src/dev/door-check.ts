// DOOR CHECK — choosing a name. Real websockets against the real boot, with
// the checks' moderator (server/moderation.ts: a few words are not fit).
//
//   1. the door offers twelve names nobody has, and more on request;
//   2. one pressed, the person is in, by that name — nobody else can take it;
//   3. a name typed and fit to show is used as typed;
//   4. a name typed and not fit is not used: it is kept, for reference, and
//      the door says so and offers a name instead — pressed, they are in by it.
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from '@lyceum/server/boot';
import { check, connect, finish, waitUntil } from './harness';
import type { Terminal } from './harness';

const OFFERED = /"props":\{"area":"n\d+","ink":"paper","label":"([A-Z][a-z]+ [A-Z][a-z]+)","value"/g;
const offeredOn = (door: Terminal): string[] => [...door.textOf('main').matchAll(OFFERED)].map((found) => found[1] ?? '');

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const base = `ws://127.0.0.1:${address.port}`;
  const names = async (): Promise<string[]> => (await runtime.db.query<{ name: string }>('SELECT name FROM members ORDER BY joined_at')).rows.map((row) => row.name);

  // ── 1 ──
  const ada = await connect(base);
  check('the door asks for a name', await ada.shows('main', 'Choose your name'));
  await waitUntil(() => offeredOn(ada).length === 12);
  const first = offeredOn(ada);
  check(`...and offers twelve, all different (${first.slice(0, 3).join(', ')}, …)`, first.length === 12 && new Set(first).size === 12);
  ada.click('main', 'more');
  check('...and others on request', await waitUntil(() => offeredOn(ada).length === 12 && offeredOn(ada).join() !== first.join()));

  // ── 2 ──
  const picked = offeredOn(ada)[0] ?? '';
  ada.click('main', 'pick', picked);
  await ada.session();
  // The door writes the member row before it grants the session.
  check(`one pressed, they are in, by that name (${picked})`, (await names()).includes(picked));
  const ben = await connect(base);
  await waitUntil(() => offeredOn(ben).length === 12);
  check('...and nobody else is offered it', !offeredOn(ben).includes(picked));
  ben.type('main', 'draft', picked);
  await new Promise((resolve) => setTimeout(resolve, 100));
  ben.click('main', 'own');
  check('...nor can type it', await ben.shows('main', `Somebody is already ${picked}`));

  // ── 3 ──
  ben.type('main', 'draft', 'Grace Turing');
  await new Promise((resolve) => setTimeout(resolve, 100));
  ben.click('main', 'own');
  await ben.session();
  check('a name typed and fit to show is used as typed', (await names()).includes('Grace Turing'));

  // ── 4 ──
  const cam = await connect(base);
  await waitUntil(() => offeredOn(cam).length === 12);
  cam.type('main', 'draft', 'Stupid Speaker');
  await new Promise((resolve) => setTimeout(resolve, 100));
  cam.click('main', 'own');
  check('a name typed and not fit to show is not used: the door says so', await cam.shows('main', '“Stupid Speaker” can’t be shown here'));
  check('...it is nobody\'s name', !(await names()).includes('Stupid Speaker'));
  const refused = (await runtime.db.query<{ text: string }>('SELECT text FROM refused_names')).rows.map((row) => row.text);
  check('...and it is kept, for reference', refused.includes('Stupid Speaker'));
  const suggested = /You can be ([A-Z][a-z]+ [A-Z][a-z]+) instead/.exec(cam.textOf('main'))?.[1] ?? '';
  cam.click('main', 'pick', suggested);
  await cam.session();
  check(`...and they are in by the name it offered (${suggested})`, suggested !== '' && (await names()).includes(suggested));

  for (const terminal of [ada, ben, cam]) terminal.close();
  httpServer.close();
  await close();
  finish();
};

await main();
