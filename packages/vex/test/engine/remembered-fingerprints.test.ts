import { describe, it, expect, vi, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '../../src/adapters/pglite/index.js';
import { createPostgresAdapter } from '../../src/adapters/postgres/index.js';
import { createQueryEngine } from '../../src/engine/runtime.js';

afterEach(() => vi.restoreAllMocks());

describe('an engine that mints a fingerprint for every generated query', () => {
  it('remembers only the most recent fingerprints it warned about, so it does not grow without end', async () => {
    const db = new PGlite();
    await db.exec(`CREATE TABLE notes (id TEXT PRIMARY KEY); INSERT INTO notes VALUES ('n1');`);
    const engine = createQueryEngine({
      adapter: createPostgresAdapter({ pool: createPglitePool(db) }),
      generateDsl: async () => ({ from: ['notes'], fields: ['notes.id'] }),
      config: { defaultLimit: 1 },
    });
    await engine.introspect();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const minted: string[] = [];
    for (let n = 0; n <= 1024; n += 1) {
      minted.push(String((await engine.execute({ intent: `note ${n}`, shape: [{ id: '' }], context: {} })).meta.cache.fingerprint));
    }
    for (const fingerprint of minted) await engine.execute({ fingerprint, context: {} });
    const first = minted[0];
    await engine.execute({ fingerprint: first, context: {} });

    expect(warn.mock.calls.filter(([line]) => String(line).includes(`"${String(first)}"`))).toHaveLength(2);
    engine.rows.stop();
    await db.close();
  });
});
