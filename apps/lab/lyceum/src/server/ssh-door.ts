import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import ssh2 from 'ssh2';
import type { Connection } from 'ssh2';
import { createWire } from '@niscorp/moss/client';
import type { WireEnv } from '@niscorp/moss/client';
import { createTerminal } from '@niscorp/moss/terminal';
import { inkTarget } from '@niscorp/moss/terminal/ink';
import { lyceumInkRegistry } from '@lyceum/ui/ink.kit';
import { sshTty } from './ssh-tty.shim';

// THE SSH DOOR — `ssh lyceum.moccadroid.com`. Anybody, any user name, no
// password: each connection is a stranger at the door, exactly as a phone that
// opens the address is. It is a TERMINAL HOST, not a second server: every
// connection opens its own moss wire to the room's socket (a client, like a
// browser tab), and moss's ink target draws the trees it is sent with the
// terminal kit (src/ui/ink.kit.ts). Stepping in grants that wire a session,
// held for as long as the connection is — nothing is written to disk.
//
//   LYCEUM_SSH_PORT      where it listens (unset: no door)
//   LYCEUM_SSH_HOST_KEY  the host key's file; made on first start and kept, so
//                        a returning visitor's ssh does not cry impostor
//
// Nothing here knows lyceum: the trees are the phone's, the policy moss's.

// A room's worth, and then some — a door is not a denial of service.
const MOST_AT_ONCE = 300;

const hostKeyAt = (file: string): string => {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const { private: key } = ssh2.utils.generateKeyPairSync('ed25519');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, key, { mode: 0o600 });
  return key;
};

// The session lives in memory, one per connection: stepping in grants it,
// leaving drops it.
const connectionEnv = (url: string): WireEnv => {
  let token: string | null = null;
  return {
    tokens: {
      load: () => token,
      save: (next) => {
        token = next;
      },
      clear: () => {
        token = null;
      },
    },
    socket: (socketUrl) => new WebSocket(socketUrl),
    defaultUrl: () => url,
  };
};

export type SshDoor = { port: number; close: () => Promise<void> };

export const openSshDoor = async (config: { port: number; socketUrl: string; hostKeyFile: string }): Promise<SshDoor> => {
  let open = 0;
  const onConnection = (client: Connection): void => {
    if (open >= MOST_AT_ONCE) {
      client.end();
      return;
    }
    open += 1;
    let leave = (): void => {};
    client.on('close', () => {
      open -= 1;
      leave();
    });
    client.on('error', () => leave());
    // Whoever you say you are, however you say it: you are a stranger at the door.
    client.on('authentication', (context) => context.accept());
    client.on('ready', () => {
      client.on('session', (acceptSession) => {
        const session = acceptSession();
        const size = { columns: 80, rows: 24 };
        let resize = (_columns: number, _rows: number): void => {};
        session.on('pty', (accept, _reject, info) => {
          size.columns = info.cols;
          size.rows = info.rows;
          accept();
        });
        session.on('window-change', (accept, _reject, info) => {
          resize(info.cols, info.rows);
          accept?.();
        });
        session.on('shell', (acceptShell) => {
          const channel = acceptShell();
          const tty = sshTty(channel, size);
          resize = tty.resize;
          const wire = createWire({ url: config.socketUrl, env: connectionEnv(config.socketUrl) });
          const terminal = createTerminal({
            wire,
            target: inkTarget({
              registry: lyceumInkRegistry(),
              stdin: tty.stdin,
              stdout: tty.stdout,
              status: wire.status,
              // The console is this server's; nobody at the door reads it.
              patchConsole: false,
              onQuit: () => leave(),
            }),
          });
          let left = false;
          leave = () => {
            if (left) return;
            left = true;
            terminal.destroy();
            wire.dispose();
            channel.end();
            client.end();
          };
        });
      });
    });
  };

  const server = new ssh2.Server({ hostKeys: [hostKeyAt(config.hostKeyFile)] }, onConnection);
  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  const address = server.address();
  return {
    port: address !== null && typeof address === 'object' ? address.port : config.port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
};
