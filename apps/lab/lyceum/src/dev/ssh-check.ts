// SSH CHECK — `ssh` into the room. A real SSH client (ssh2's) against the real
// door (src/server/ssh-door.ts) against the real boot: the door opens its own
// moss wire per connection, and moss's ink target draws the phone's trees with
// the terminal kit.
//
//   1. anybody gets in — any user name, no password — and is a stranger at the
//      door: the door is drawn, the names it offers numbered;
//   2. typing a name's number steps in as that name: a real session for a new
//      person, their phone drawn — the name across the top, the assistant on
//      its list — as on a phone;
//   3. two connections are two people;
//   4. Ctrl+C leaves, and the door lets them go.
process.env['FORCE_COLOR'] = '0';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import type { ClientChannel } from 'ssh2';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { boot } from '@lyceum/server/boot';
import { check, finish, giveAssistant, waitUntil } from './harness';

type Visitor = { screen: () => string; press: (keys: string) => void; closed: () => boolean; leave: () => void };

const plain = (raw: string): string => raw.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');

const visit = (port: number, username: string): Promise<Visitor> =>
  new Promise((resolve, reject) => {
    const client = new ssh2.Client();
    let output = '';
    let closed = false;
    client.on('ready', () => {
      client.shell({ term: 'xterm-256color', cols: 100, rows: 40 }, (error: Error | undefined, channel: ClientChannel) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        channel.on('data', (data: Buffer) => {
          output += data.toString('utf8');
        });
        channel.on('close', () => {
          closed = true;
        });
        resolve({
          screen: () => plain(output),
          press: (keys) => channel.write(keys),
          closed: () => closed,
          leave: () => client.end(),
        });
      });
    });
    client.on('error', reject);
    client.connect({ host: '127.0.0.1', port, username });
  });

const main = async (): Promise<void> => {
  const { server, runtime, close } = await boot();
  const httpServer = serve({ fetch: server.fetch, port: 0 });
  attachSocket(httpServer, server.socket);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  const { openSshDoor } = await import('@lyceum/server/ssh-door');
  const door = await openSshDoor({ port: 0, socketUrl: `ws://127.0.0.1:${address.port}/socket`, hostKeyFile: join(mkdtempSync(join(tmpdir(), 'lyceum-ssh-')), 'key') });

  // ── 1 ──
  const ada = await visit(door.port, 'anybody');
  check('anybody gets in, with no password, and is shown the door', await waitUntil(() => ada.screen().includes('Choose your name')));
  // The first name offered, and the number beside it.
  const offered = await waitUntil(() => /\[(\d+)\] \( ([A-Z][a-z]+ [A-Z][a-z]+) \)/.test(ada.screen())) ? /\[(\d+)\] \( ([A-Z][a-z]+ [A-Z][a-z]+) \)/.exec(ada.screen()) : null;
  const marker = offered?.[1];
  const chosen = offered?.[2] ?? '\u0000';
  check(`...the names it offers numbered (${marker ?? 'none'}: ${chosen})`, marker !== undefined);

  // ── 2 ──
  const before = (await runtime.db.query('SELECT 1 FROM members')).rows.length;
  ada.press(marker ?? '');
  check(`typing the number steps in as ${chosen}: their phone, nothing on its list yet`, await waitUntil(() => ada.screen().includes('Nothing here yet.')));
  await giveAssistant(server, runtime.pool);
  check('...given the assistant, it is on their list — the terminal follows', await waitUntil(() => ada.screen().includes('Can: ')));
  check('...a member now, by that name', (await runtime.db.query('SELECT 1 FROM members WHERE name = $1', [chosen])).rows.length === 1);
  check('...a new person in the room', (await runtime.db.query('SELECT 1 FROM members')).rows.length === before + 1);

  // The screen since `from`.
  const since = (visitor: Visitor, from: number): string => visitor.screen().slice(from);

  // A number is read off a screen that has stopped changing — as a person
  // reads it: a screen still filling in renumbers what comes after.
  const settled = async (visitor: Visitor): Promise<void> => {
    for (let last = visitor.screen().length; ; ) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (visitor.screen().length === last) return;
      last = visitor.screen().length;
    }
  };
  // ── a vex query's table, drawn: its cells carry the rows' values ──
  // The assistant's field — the assistant is on every phone's list: its number
  // focuses it, typing types, Enter sends; the assistant's query opens over the
  // screen, its table drawn.
  await settled(ada);
  const field = /\[(\d+)\] ⟨/.exec(ada.screen().slice(ada.screen().lastIndexOf('Can: ')))?.[1];
  ada.press(field ?? '');
  await settled(ada);
  ada.press('Who is in the room?');
  await settled(ada);
  const asked = ada.screen().length;
  ada.press('\r');
  await waitUntil(() => /Generated:|Replayed:/.test(since(ada, asked)));
  await settled(ada);
  const names = (await runtime.db.query<{ name: string }>('SELECT name FROM members')).rows.map((row) => row.name);
  // The table's own lines: back from the line saying how it was answered to
  // its header — the person's name is across the top of their phone too, so
  // it is read from the table, not from anywhere on the screen.
  const screen = ada.screen();
  const end = Math.max(screen.lastIndexOf('Generated:'), screen.lastIndexOf('Replayed:'));
  const head = screen.lastIndexOf('Name', end);
  const table = end === -1 ? '' : screen.slice(head, end);
  check(`an answer's table shows its values — somebody in the room by name (${names.join(', ')})`, head !== -1 && names.some((name) => name !== '' && table.includes(name)));

  // ── 3 ──
  const ben = await visit(door.port, 'anybody');
  check('a second connection is somebody else, at the door again', await waitUntil(() => ben.screen().includes('Choose your name')));

  // ── 4 ──
  ada.press('\u0003');
  check('Ctrl+C leaves: the door closes the connection', await waitUntil(ada.closed));
  ben.leave();

  await door.close();
  httpServer.close();
  await close();
  finish();
};

await main();
