import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { runIntake, reachOf, copyPress, callIntegrationWith, initIntegrations, listIntegrations } from '../src/integrations';
import type { IntakeContext, Bundle, StorePress } from '../src/integrations';
import { createAssertionSigner, verifyAssertion } from '../src/assert';

// The listing's long form travels WITH the bundle (story, highlights, press),
// and press is the one field that moves bytes: copied at intake, never
// fetched at render time. These tests hold both halves — the vocabulary
// admits and refuses correctly, and the copy step leaves nothing pointing at
// the service.

const ctx = (over: Partial<IntakeContext> = {}): IntakeContext => ({
  integrationId: 'acme',
  components: new Set<string>(),
  fingerprints: new Set<string>(),
  attachable: new Set<string>(),
  menuSlots: new Set<string>(),
  ...over,
});

const bundle = (meta: Record<string, unknown> = {}): unknown => ({
  integration: 'acme',
  meta,
  actions: {},
});

const okBundle = (meta: Record<string, unknown> = {}): Bundle => {
  const result = runIntake(bundle(meta), ctx());
  if (!result.ok) throw new Error(result.reasons.join('; '));
  return result.bundle;
};

describe('the listing vocabulary', () => {
  it('a bundle saying nothing new still parses, with empty long form', () => {
    const b = okBundle({ title: 'Acme', tagline: 'ranks' });
    expect(b.meta.story).toEqual([]);
    expect(b.meta.highlights).toEqual([]);
    expect(b.meta.press).toEqual([]);
  });

  it('a bundle declaring all three lands whole', () => {
    const b = okBundle({
      title: 'Acme',
      story: [{ heading: 'How it started', prose: 'In a garage.' }],
      highlights: ['Belt colors, live', 'No spreadsheets'],
      press: ['/integrations/acme/press/hero.png'],
    });
    expect(b.meta.story).toHaveLength(1);
    expect(b.meta.highlights).toHaveLength(2);
    expect(b.meta.press).toEqual(['/integrations/acme/press/hero.png']);
  });

  it('meta is strict now — a typo refuses instead of stripping silently', () => {
    const result = runIntake(bundle({ presss: ['/integrations/acme/press/x.png'] }), ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(' ')).toContain('meta');
  });

  it('press outside the integration\'s own prefix is refused', () => {
    const result = runIntake(bundle({ press: ['/integrations/somebody-else/press/x.png'] }), ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toMatch(/press .*own prefix/);
  });

  it('press at a reserved door is refused', () => {
    for (const path of ['/integrations/acme/hook/x.png', '/integrations/acme/frame/x.png']) {
      const result = runIntake(bundle({ press: [path] }), ctx());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons[0]).toMatch(/reserved/);
    }
  });

  it('press never widens reach — it is fetched once at intake, not forwarded', () => {
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    expect(reachOf(b, 'acme')).toEqual({});
  });
});

describe('copyPress', () => {
  const image = (bytes: Uint8Array<ArrayBuffer>, contentType = 'image/png'): Response =>
    new Response(bytes, { status: 200, headers: { 'content-type': contentType } });

  const recordingSeam = () => {
    const calls: { id: string; name: string; bytes: Uint8Array; contentType: string }[] = [];
    const seam: StorePress = async (id, name, bytes, contentType) => {
      calls.push({ id, name, bytes, contentType });
      return `/blobs/${id}/${name}`;
    };
    return { calls, seam };
  };

  it('no press declared: nothing fetched, nothing stored', async () => {
    const fetchImpl = vi.fn();
    const { calls, seam } = recordingSeam();
    const result = await copyPress(okBundle(), 'acme', 'https://acme.example', seam, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, urls: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('copies the bytes through the proxy\'s own mapping and keeps the host\'s urls', async () => {
    const payload = new Uint8Array([137, 80, 78, 71]);
    const fetchImpl = vi.fn(async () => image(payload));
    const { calls, seam } = recordingSeam();
    const b = okBundle({ press: ['/integrations/acme/press/hero.png', '/integrations/acme/press/team.jpg'] });

    const result = await copyPress(b, 'acme', 'https://acme.example/', seam, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, urls: ['/blobs/acme/press/hero.png', '/blobs/acme/press/team.jpg'] });
    // The declared path maps exactly as the proxy maps it: prefix off, onto
    // the registered origin. No other url shape exists for it to fetch.
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://acme.example/press/hero.png');
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://acme.example/press/team.jpg');
    expect(calls[0]).toMatchObject({ id: 'acme', name: 'press/hero.png', contentType: 'image/png' });
    expect([...(calls[0]?.bytes ?? [])]).toEqual([...payload]);
    // The killed-service property: the result holds host ground only. Nothing
    // in it mentions the service, and no further fetch is owed.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok && result.urls.every((u) => u.startsWith('/blobs/'))).toBe(true);
  });

  it('press declared with no seam to hold it refuses, naming the gap', async () => {
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copyPress(b, 'acme', 'https://acme.example', undefined, vi.fn() as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain('storePress');
  });

  it('a dead path refuses the whole payload, naming the path', async () => {
    const fetchImpl = vi.fn(async () => new Response('gone', { status: 404 }));
    const { seam } = recordingSeam();
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copyPress(b, 'acme', 'https://acme.example', seam, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toBe('press "/integrations/acme/press/hero.png": the service answered 404');
  });

  it('a non-image answer refuses — press is images, says the vocabulary', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
    const { seam } = recordingSeam();
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copyPress(b, 'acme', 'https://acme.example', seam, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain('"text/html", which is not an image');
  });

  it('the seam\'s refusal is a refusal — bounds are the host\'s to draw', async () => {
    const fetchImpl = vi.fn(async () => image(new Uint8Array(4)));
    const seam: StorePress = async () => {
      throw new Error('too big for this deployment');
    };
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copyPress(b, 'acme', 'https://acme.example', seam, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain('too big');
  });
});

// ═══════════════════════════════════════════════════════════════
// offers/needs — what an integration tells and what it hears. moss validates
// shape and carries the declarations; what a kind means is the host's
// contract vocabulary, and the host's bus is the only reader.
// ═══════════════════════════════════════════════════════════════

describe('offers and needs', () => {
  it('a bundle declaring both lands whole', () => {
    const result = runIntake({ integration: 'acme', actions: {}, offers: ['attendance'], needs: ['booking'] }, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.offers).toEqual(['attendance']);
      expect(result.bundle.needs).toEqual(['booking']);
    }
  });

  it('a bundle saying nothing parses to empty arrays', () => {
    const b = okBundle();
    expect(b.offers).toEqual([]);
    expect(b.needs).toEqual([]);
  });

  it('the row carries them, and a row predating the columns answers empty', async () => {
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    await pool.query(`INSERT INTO integrations (id, url, offers, needs) VALUES ('acme', 'https://acme.example', '["attendance"]'::jsonb, '["booking"]'::jsonb)`);
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('elder', 'https://elder.example')`);
    const rows = await listIntegrations(pool);
    expect(rows.find((r) => r.id === 'acme')?.offers).toEqual(['attendance']);
    expect(rows.find((r) => r.id === 'acme')?.needs).toEqual(['booking']);
    expect(rows.find((r) => r.id === 'elder')?.offers).toEqual([]);
    expect(rows.find((r) => r.id === 'elder')?.needs).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// callIntegration — the outbound act. The deployment calls an integration
// with nobody driving; the gates are approved + installed, the credential is
// a REAL assertion (verified here against the signer's public half, not just
// inspected), and refusals throw sentences the orchestrator must see.
// ═══════════════════════════════════════════════════════════════

describe('callIntegration', () => {
  const world = async (over: { status?: string; installed?: readonly string[] | undefined } = {}) => {
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    await pool.query(`INSERT INTO integrations (id, url, status) VALUES ('acme', 'https://acme.example', $1)`, [over.status ?? 'approved']);
    const signer = createAssertionSigner();
    const answered = new Response(JSON.stringify({ erased: true }), { status: 200 });
    const fetchImpl = vi.fn(async () => answered);
    const call = callIntegrationWith({
      pool,
      installedFor: async () => ('installed' in over ? over.installed : ['acme']),
      scopeValuesFor: async () => ({ studio_id: 's_1', audience: 'owner' }),
      mint: signer.mint,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    return { call, fetchImpl, signer, answered };
  };

  it('an unknown integration throws, before any credential exists', async () => {
    const { call, fetchImpl } = await world();
    await expect(call('ghost', 'lifecycle/erase-party', { principal: 'i_mara' })).rejects.toThrow(/no such integration/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a pending or revoked integration throws — approval is the first gate', async () => {
    const { call, fetchImpl } = await world({ status: 'pending' });
    await expect(call('acme', 'lifecycle/erase-party', { principal: 'i_mara' })).rejects.toThrow(/not approved.*pending/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('not installed for the principal\'s tenant throws — the second gate', async () => {
    const { call, fetchImpl } = await world({ installed: ['somebody-else'] });
    await expect(call('acme', 'lifecycle/erase-party', { principal: 'i_mara' })).rejects.toThrow(/not installed/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('an app with no install seam admits — the proxy\'s rule, mirrored', async () => {
    const { call } = await world({ installed: undefined });
    const response = await call('acme', 'lifecycle/erase-party', { principal: 'i_mara' });
    expect(response.status).toBe(200);
  });

  it('mints an assertion the other end can actually verify, and returns what it answered', async () => {
    const { call, fetchImpl, signer, answered } = await world();
    const response = await call('acme', '/lifecycle/erase-party', { principal: 'i_mara', body: { member: 'i_kade' }, scope: { audience: 'owner', reason: 'gdpr' } });

    expect(response).toBe(answered);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://acme.example/lifecycle/erase-party');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ member: 'i_kade' }));

    const token = String((init.headers as Record<string, string>)['authorization']).replace(/^Bearer /, '');
    const claims = verifyAssertion(token, signer.verifyKey);
    expect(claims?.integration).toBe('acme');
    expect(claims?.principal).toBe('i_mara');
    // Resolver values first, init.scope merged over them — the deployment's
    // explicit word wins.
    expect(claims?.scope).toEqual({ studio_id: 's_1', audience: 'owner', reason: 'gdpr' });
  });

  it('a GET travels without a body', async () => {
    const { call, fetchImpl } = await world();
    await call('acme', 'lifecycle/export', { principal: 'i_mara', method: 'GET' });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('GET');
    expect('body' in init).toBe(false);
  });
});
