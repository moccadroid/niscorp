import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { start } from '../src/serve';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'moss-routes');

describe('nisc start — an app behind moss', () => {
  it('serves the project’s own routes and its drawn pages when checking its functions reads one of those routes', async () => {
    const started = await start({ root, port: 0, print: () => undefined });
    try {
      expect(await (await fetch(`${started.url}/hello`)).text()).toBe('hello');
      expect(await (await fetch(`${started.url}/`)).text()).toContain('<p>drawn</p>');
    } finally {
      await started.close();
    }
  }, 60_000);

  it('an app route that says its answer never changes gives each person their own, compressed', async () => {
    const started = await start({ root, port: 0, print: () => undefined });
    try {
      for (const user of ['alice', 'bob']) {
        const answer = await fetch(`${started.url}/thumb?user=${user}`, { headers: { 'accept-encoding': 'br' } });
        expect(answer.headers.get('content-encoding')).toBe('br');
        expect(await answer.text()).toMatch(new RegExp(`^thumbnail of ${user} pixels`));
      }
    } finally {
      await started.close();
    }
  }, 60_000);
});
