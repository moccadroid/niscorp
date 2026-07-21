import { homedir } from 'node:os';
import { join } from 'node:path';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import { createTerminal } from '@niscorp/moss/terminal';
import { inkTarget } from '@niscorp/moss/terminal/ink';

// Relay full-screen in a terminal — the Ink render target on the same wire
// and token file as `pnpm tty`'s REPL: Tab cycles focus, Enter activates,
// typing types, Ctrl+C leaves. Run the server first (`pnpm serve`).
const url = process.env['RELAY_URL'] ?? 'ws://127.0.0.1:8787/socket';
const wire = createWire({ env: nodeEnv({ url, tokenFile: join(homedir(), '.moss', 'relay.token') }) });

const terminal = createTerminal({
  target: inkTarget({
    status: wire.status,
    onQuit: () => {
      terminal.destroy();
      wire.dispose();
      process.exit(0);
    },
  }),
  wire,
});
