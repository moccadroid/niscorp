import { describe, it, expect, vi, afterEach } from 'vitest';
import { vex as vexHono } from '../../src/adapters/hono/index.js';
import { vex as vexExpress } from '../../src/adapters/express/index.js';
import { createMemoryCache } from '../../src/cache/memory.js';
import type { QueryEngine } from '../../src/types.js';

const SEEDED = 'tasks/list';

const engineWithEntry = async (): Promise<QueryEngine> => {
  const cache = createMemoryCache();
  await cache.set(SEEDED, { kind: 'ok', dsl: { from: ['tasks'], fields: ['tasks.id'] }, protected: true, createdAt: 1 });
  return { cache, getSchema: () => undefined } as unknown as QueryEngine;
};

const send = (app: ReturnType<typeof vexHono>, method: 'PATCH' | 'DELETE', body: unknown) =>
  app.request('/', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fingerprint management on an unlocked endpoint', () => {
  it('is refused with manageFingerprints: false, and the entry stays as it was', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await engineWithEntry();
    const app = vexHono({ engine, manageFingerprints: false });
    const patched = await send(app, 'PATCH', { fingerprint: SEEDED, protected: false });
    expect(patched.status).toBe(403);
    expect(await patched.json()).toMatchObject({ error: 'locked' });
    expect((await send(app, 'DELETE', { fingerprint: SEEDED })).status).toBe(403);
    expect(await engine.cache.get(SEEDED)).toMatchObject({ protected: true });
  });

  it('is refused through Express with manageFingerprints: false', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await engineWithEntry();
    const handler = vexExpress({ engine, manageFingerprints: false });
    let status = 0;
    const res = { status: (code: number) => ((status = code), res), json: () => undefined };
    await handler({ method: 'PATCH', body: { fingerprint: SEEDED, protected: false }, query: {} }, res);
    expect(status).toBe(403);
    expect(await engine.cache.get(SEEDED)).toMatchObject({ protected: true });
  });

  it('is allowed as before when left on, and the endpoint says so once as it is made', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await engineWithEntry();
    const app = vexHono({ engine });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('manageFingerprints');
    expect((await send(app, 'PATCH', { fingerprint: SEEDED, protected: false })).status).toBe(200);
    expect((await send(app, 'DELETE', { fingerprint: SEEDED })).status).toBe(200);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('says nothing on a locked endpoint, or with management off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = await engineWithEntry();
    vexHono({ engine, locked: true });
    vexHono({ engine, manageFingerprints: false });
    vexExpress({ engine, locked: true });
    vexExpress({ engine, manageFingerprints: false });
    expect(warn).not.toHaveBeenCalled();
  });
});
