import { homedir } from 'node:os';
import { join } from 'node:path';
import { createWire } from '@niscorp/moss/client';
import { nodeEnv } from '@niscorp/moss/client/node';
import { createTerminal } from '@niscorp/moss/terminal';
import { ttyTarget } from '@niscorp/moss/terminal/tty';

// Relay in a real terminal — the third render target on the same wire. Run
// the server first (`pnpm serve`, port 8787), then `pnpm tty` here or on any
// machine that reaches it (RELAY_URL overrides). The session token lives in
// ~/.moss/relay.token, the TTY twin of the browser's localStorage: sign in
// once through the served login canvas and reconnects stay authenticated.
const url = process.env['RELAY_URL'] ?? 'ws://127.0.0.1:8787/socket';
const wire = createWire({ env: nodeEnv({ url, tokenFile: join(homedir(), '.moss', 'relay.token') }) });

const terminal = createTerminal({
  target: ttyTarget({
    input: process.stdin,
    output: process.stdout,
    status: wire.status,
    onQuit: () => {
      terminal.destroy();
      wire.dispose();
      process.exit(0);
    },
  }),
  wire,
});

console.info(`[relay/tty] wire → ${url}`);
