import { homedir } from 'node:os';
import { join } from 'node:path';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import { createTerminal } from '@niscorp/moss/terminal';
import { inkTarget } from '@niscorp/moss/terminal/ink';

const url = process.env['RELAY_URL'] ?? 'ws://127.0.0.1:8787/socket';
const wire = createWire({ env: nodeEnv({ url, tokenFile: join(homedir(), '.moss', 'relay.token') }) });

const terminal = createTerminal({
  target: inkTarget({
    onQuit: () => {
      terminal.destroy();
      wire.dispose();
      process.exit(0);
    },
  }),
  wire,
});
