import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dev } from '../src/commands';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'moss-routes');

describe('nisc dev — an app behind moss', () => {
  it('answers the project’s own route that `dev.owned` names, when checking its functions reads that route', async () => {
    const started = await dev({ root, port: 0 });
    try {
      expect(await (await fetch(new URL('/hello', started.url))).text()).toBe('hello');
    } finally {
      await started.close();
    }
  }, 60_000);
});
