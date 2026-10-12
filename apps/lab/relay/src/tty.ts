import { homedir } from 'node:os';
import { join } from 'node:path';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import { createTerminal } from '@niscorp/moss/terminal';
import { ttyTarget } from '@niscorp/moss/terminal/tty';

const url = process.env['RELAY_URL'] ?? 'ws://127.0.0.1:8787/socket';
const wire = createWire({ env: nodeEnv({ url, tokenFile: join(homedir(), '.moss', 'relay.token') }) });

const terminal = createTerminal({
  target: ttyTarget({
    input: process.stdin,
    output: process.stdout,
    onQuit: () => {
      terminal.destroy();
      wire.dispose();
      process.exit(0);
    },
  }),
  wire,
});

console.info(`[relay/tty] wire → ${url}`);
