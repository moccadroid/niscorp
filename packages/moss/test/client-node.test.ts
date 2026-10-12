import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { nodeEnv } from '../src/client/node';

describe('nodeEnv — the Node host', () => {
  it('round-trips the token through a file, creating parent dirs on save', () => {
    const tokenFile = join(mkdtempSync(join(tmpdir(), 'moss-wire-')), 'deep', 'token');
    const e = nodeEnv({ url: 'ws://127.0.0.1:8787/socket', tokenFile });

    expect(e.tokens.load()).toBeNull();
    e.tokens.save('tok-1');
    expect(e.tokens.load()).toBe('tok-1');
    e.tokens.clear();
    expect(e.tokens.load()).toBeNull();
    e.tokens.clear();
  });

  it('treats a whitespace-only file as no token', () => {
    const tokenFile = join(mkdtempSync(join(tmpdir(), 'moss-wire-')), 'token');
    const e = nodeEnv({ url: 'ws://x/socket', tokenFile });
    e.tokens.save('');
    expect(e.tokens.load()).toBeNull();
  });

  it('defaultUrl is the configured url — a process has no location', () => {
    expect(nodeEnv({ url: 'ws://127.0.0.1:8787/socket' }).defaultUrl()).toBe('ws://127.0.0.1:8787/socket');
  });
});
