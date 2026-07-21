import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { nodeEnv } from '../src/client/node';

// The Node host env — the token file round-trip and the explicit url. The
// socket half is the runtime's WHATWG WebSocket, exercised end-to-end by
// relay's dom-terminal check, not faked here.
describe('nodeEnv — the Node host', () => {
  it('round-trips the token through a file, creating parent dirs on save', () => {
    const tokenFile = join(mkdtempSync(join(tmpdir(), 'moss-wire-')), 'deep', 'token');
    const e = nodeEnv({ url: 'ws://127.0.0.1:8787/socket', tokenFile });

    expect(e.tokens.load()).toBeNull(); // no file yet — anonymous
    e.tokens.save('tok-1');
    expect(e.tokens.load()).toBe('tok-1'); // trimmed of the trailing newline
    e.tokens.clear();
    expect(e.tokens.load()).toBeNull();
    e.tokens.clear(); // clearing an empty slot is fine
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
