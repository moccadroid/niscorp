// SSH CHECK — `ssh` into the room. A real SSH client (ssh2's) against the real
// door (src/server/ssh-door.ts) against the real boot: the door opens its own
// moss wire per connection, and moss's ink target draws the phone's trees with
// the terminal kit.
//
//   1. anybody gets in — any user name, no password — and is a stranger at the
//      door: the door is drawn, its button numbered;
//   2. typing the button's number steps in: a real session for a new person,
//      whose ID card the room then writes, as on a phone;
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
import { check, finish, waitUntil } from './harness';

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
  check('anybody gets in, with no password, and is shown the door', await waitUntil(() => ada.screen().includes('Step in')));
  const marker = /\[(\d+)\][^[]*Step in/.exec(ada.screen())?.[1];
  check(`...its button numbered (${marker ?? 'none'})`, marker !== undefined);

  // ── 2 ──
  const before = (await runtime.db.query('SELECT 1 FROM members')).rows.length;
  ada.press(marker ?? '');
  check('typing the number steps in: they are a member now, with a card', await waitUntil(() => ada.screen().includes('ID card')));
  check('...a new person in the room', (await runtime.db.query('SELECT 1 FROM members')).rows.length === before + 1);

  // ── the phone's tabs: one list canvas, one ref each, every one its own ──
  // The screen since `from`, and the number printed beside a label in it.
  const since = (visitor: Visitor, from: number): string => visitor.screen().slice(from);
  const numberOf = (screen: string, label: string): string | undefined => new RegExp(String.raw`\[(\d+)\] \( ${label} \)`).exec(screen.slice(screen.lastIndexOf(`( ${label} )`) - 12))?.[1];
  await waitUntil(() => ada.screen().includes('( Assistant )'));
  const tabs = ['Card', 'Query', 'Q&A', 'Assistant'].map((label) => numberOf(ada.screen(), label));
  check(`every tab has a number of its own (${tabs.join(', ')})`, tabs.every((n) => n !== undefined) && new Set(tabs).size === tabs.length);
  // A number is read off a screen that has stopped changing — as a person
  // reads it: a screen still filling in renumbers what comes after.
  const settled = async (visitor: Visitor): Promise<void> => {
    for (let last = visitor.screen().length; ; ) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (visitor.screen().length === last) return;
      last = visitor.screen().length;
    }
  };
  for (const [label, shows] of [['Query', 'Vex query'], ['Q&A', 'a question for the speaker'], ['Assistant', 'Built from'], ['Card', 'ID card']] as const) {
    await settled(ada);
    const from = ada.screen().length;
    ada.press(numberOf(ada.screen(), label) ?? '');
    check(`typing the ${label} tab's number opens ${label}`, await waitUntil(() => since(ada, from).includes(shows)));
  }

  // ── an answer's table, drawn: its cells carry the rows' values ──
  // The field's number focuses it; typing types; Tab moves to Run; Enter presses.
  await settled(ada);
  ada.press(numberOf(ada.screen(), 'Query') ?? '');
  await waitUntil(() => ada.screen().includes('Vex query'));
  await settled(ada);
  const field = /\[(\d+)\] ⟨/.exec(ada.screen().slice(ada.screen().lastIndexOf('Vex query')))?.[1];
  ada.press(field ?? '');
  await settled(ada);
  ada.press('Who is in the room?');
  await settled(ada);
  const asked = ada.screen().length;
  // One key at a time, as fingers press them — a chunk of two is one keypress.
  ada.press('\t');
  await settled(ada);
  ada.press('\r');
  await waitUntil(() => since(ada, asked).includes('Department'));
  await settled(ada);
  const names = (await runtime.db.query<{ name: string }>('SELECT name FROM members')).rows.map((row) => row.name);
  // The table's own lines: after its header, before the line saying how it was
  // answered — the person's name is on their card strip too, above it.
  const screen = ada.screen();
  const head = screen.lastIndexOf('Department');
  const table = screen.slice(head, head + screen.slice(head).search(/Generated:|Replayed:/));
  check(`an answer's table shows its values — somebody in the room by name (${names.join(', ')})`, head !== -1 && names.some((name) => name !== '' && table.includes(name)));

  // ── 3 ──
  const ben = await visit(door.port, 'anybody');
  check('a second connection is somebody else, at the door again', await waitUntil(() => ben.screen().includes('Step in')));

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
