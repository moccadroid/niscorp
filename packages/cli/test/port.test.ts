import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NISC } from './nisc';

const OWN_SHELL = join(import.meta.dirname, 'fixtures', 'own-shell');
const SLOW = 60_000;

const nisc = (args: readonly string[], env: Record<string, string> = {}): { code: number | null; out: string } => {
  const result = spawnSync(process.execPath, [...NISC, ...args, '--root', OWN_SHELL], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 30_000 });
  return { code: result.status, out: `${result.stdout}\n${result.stderr}` };
};

const taken = (): Promise<{ port: number; server: Server }> =>
  new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, () => {
      const address = server.address();
      done({ port: address !== null && typeof address === 'object' ? address.port : 0, server });
    });
  });

describe('nisc start — the port', () => {
  it('a port something else listens on is said so, with what to do', async () => {
    const { port, server } = await taken();
    try {
      const { code, out } = nisc(['start', '--port', String(port)]);
      expect(out).toContain(`nisc: cannot listen on port ${port}`);
      expect(out).toContain('--port <n>');
      expect(out).not.toContain("Unhandled 'error' event");
      expect(code).toBe(1);
    } finally {
      server.close();
    }
  }, SLOW);

  it('--port that is not a port is refused by name', () => {
    const { code, out } = nisc(['start', '--port', 'abc']);
    expect(out).toContain('nisc: --port "abc" is not a port');
    expect(out).not.toContain('ERR_SOCKET_BAD_PORT');
    expect(code).toBe(1);
  }, SLOW);

  it('…and so is $PORT', () => {
    const { code, out } = nisc(['start'], { PORT: '99999' });
    expect(out).toContain('nisc: PORT "99999" is not a port');
    expect(code).toBe(1);
  }, SLOW);

  it('a command that takes no port still ignores --port, as it always has', () => {
    const { code, out } = nisc(['build', '--skip-bundle', '--port', 'abc']);
    expect(out).not.toContain('is not a port');
    expect(code).toBe(0);
  }, SLOW);
});
