import { describe, it, expect, vi } from 'vitest';
import { runIntake, reachOf, copyPress } from '../src/integrations';
import type { IntakeContext, Bundle, StorePress } from '../src/integrations';

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
