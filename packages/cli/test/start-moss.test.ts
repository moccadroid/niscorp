import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { start } from '../src/commands';

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
});
