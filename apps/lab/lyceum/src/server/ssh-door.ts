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

const MOST_AT_ONCE = 300;

// ssh2 now and then writes an ed25519 key it cannot read back; one it can is kept.
const generatedHostKey = (): string => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { private: key } = ssh2.utils.generateKeyPairSync('ed25519');
    if (!(ssh2.utils.parseKey(key) instanceof Error)) return key;
  }
  throw new Error('lyceum: ssh2 generated five host keys it could not read back');
};

const hostKeyAt = (file: string): string => {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const key = generatedHostKey();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, key, { mode: 0o600 });
  return key;
};

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
    socket: ({ url: socketUrl, offered }) => new WebSocket(socketUrl, offered),
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
    // Any user name, any method: every connection is a stranger at the door.
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
