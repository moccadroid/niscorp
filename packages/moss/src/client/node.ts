import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { WireEnv } from './env';

export const nodeEnv = (config: { url: string; tokenFile?: string }): WireEnv => {
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
          // Unwritable: the session lives for this process only.
        }
      },
      clear: () => {
        try {
          rmSync(tokenFile, { force: true });
        } catch {
          // A file that cannot be removed is left.
        }
      },
    },
    socket: ({ url, offered }) => new WebSocket(url, offered),
    defaultUrl: () => config.url,
  };
};
