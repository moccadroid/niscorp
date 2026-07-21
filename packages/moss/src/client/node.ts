import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { WireEnv } from './index';

// ═══════════════════════════════════════════════════════════════
// The Node host env — the wire on a plain Node (or Bun) process: the token
// in a file instead of localStorage, the runtime's WHATWG WebSocket, and an
// explicit url (a process has no location to derive one from). Wire-side,
// this is the whole difference between a browser terminal and a TTY one.
// Its own entry (`@niscorp/moss/client/node`) so node builtins never enter
// a browser bundle.
// ═══════════════════════════════════════════════════════════════

export const nodeEnv = (config: { url: string; tokenFile?: string }): WireEnv => {
  // Apps sharing a machine should namespace their own file; the default is
  // one moss session per user.
  const tokenFile = config.tokenFile ?? join(homedir(), '.moss', 'token');
  return {
    tokens: {
      load: () => {
        try {
          const raw = readFileSync(tokenFile, 'utf8').trim();
          return raw === '' ? null : raw;
        } catch {
          return null;
        }
      },
      save: (token) => {
        try {
          mkdirSync(dirname(tokenFile), { recursive: true });
          writeFileSync(tokenFile, `${token}\n`, 'utf8');
        } catch {
          /* unwritable — the session lives for this process only */
        }
      },
      clear: () => {
        try {
          rmSync(tokenFile, { force: true });
        } catch {
          /* nothing stored, nothing to clear */
        }
      },
    },
    socket: (url) => new WebSocket(url),
    defaultUrl: () => config.url,
  };
};
