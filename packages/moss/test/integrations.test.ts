import { describe, it, expect, vi, beforeAll } from 'vitest';
import { z } from 'zod';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { PgPool } from '@niscorp/vex';
import type { Replay } from '../src/data/own-entries';
import { failingAt, registryOver } from './registry-db';
import { neverAnswers } from './never-answers';
import { runIntake, intakeContextOf } from '../src/integrations/intake';
import { reachOf } from '../src/integrations/reach';
import { copyPress } from '../src/integrations/press';
import { callIntegrationWith } from '../src/integrations/call';
import { createForwarder } from '../src/integrations/forward';
import { findIntegration, landBundle, listIntegrations } from '../src/integrations/registry';
import type { Landing } from '../src/integrations/registry';
import type { HostVocabulary, IntakeContext } from '../src/integrations/intake';
import { BundleSchema } from '../src/integrations/bundle';
import type { Bundle } from '../src/integrations/bundle';
import type { StorePress } from '../src/integrations/press';
import { createAssertionSigner, verifyAssertion } from '../src/integrations/credentials';
import { pristineDatabases } from './pristine-database';

// A database of its own for each test that wants one, started from one that
// was initialised once for this file (./pristine-database.ts says why).
const freshDatabase = pristineDatabases();

// The listing's long form travels WITH the bundle (story, highlights, press),
// and press is the one field that moves bytes: copied at intake, never
// fetched at render time. These tests hold both halves — the vocabulary
// admits and refuses correctly, and the copy step leaves nothing pointing at
// the service.

const ctx = (over: Partial<IntakeContext> = {}): IntakeContext => ({
  integrationId: 'acme',
  components: new Map<string, { propsSchema?: unknown }>(),
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

describe('an integration id', () => {
  it('is lower-case letters, digits and hyphens, starting with a letter: a bundle that says any other is refused', () => {
    for (const id of ['acme', 'acme-pay', 'a2']) {
      expect([id, runIntake({ integration: id, actions: {} }, ctx({ integrationId: id })).ok]).toEqual([id, true]);
    }
    // Each of these as the bundle's own word for itself, fetched under the same id.
    for (const id of ['Acme', 'acme.pay', 'acme/pay', '9acme', 'acme_pay', '-acme', '']) {
      const result = runIntake({ integration: id, actions: {} }, ctx({ integrationId: id }));
      expect([id, result.ok]).toEqual([id, false]);
      if (!result.ok) expect(result.reasons.join(' ')).toContain('integration');
    }
  });
});

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

  // The bounds a deployment sets on one image: here half a minute to arrive,
  // and a megabyte, unless a case says otherwise.
  const copy = (b: Bundle, serviceUrl: string, store: StorePress | undefined, fetchImpl: typeof fetch, limits: { timeoutMs?: number; maxBytes?: number } = {}) =>
    copyPress(b, 'acme', serviceUrl, { store, timeoutMs: 30_000, maxBytes: 1024 * 1024, fetch: fetchImpl, ...limits });

  it('no press declared: nothing fetched, nothing stored', async () => {
    const fetchImpl = vi.fn();
    const { calls, seam } = recordingSeam();
    const result = await copy(okBundle(), 'https://acme.example', seam, fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ ok: true, urls: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('copies the bytes through the proxy\'s own mapping and keeps the host\'s urls', async () => {
    const payload = new Uint8Array([137, 80, 78, 71]);
    const fetchImpl = vi.fn(async () => image(payload));
    const { calls, seam } = recordingSeam();
    const b = okBundle({ press: ['/integrations/acme/press/hero.png', '/integrations/acme/press/team.jpg'] });

    const result = await copy(b, 'https://acme.example/', seam, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, urls: ['/blobs/acme/press/hero.png', '/blobs/acme/press/team.jpg'] });
    // The declared path maps exactly as the proxy maps it: prefix off, onto
    // the registered origin. No other url shape exists for it to fetch. Each
    // goes out with the signal that ends it when it takes too long.
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://acme.example/press/hero.png', { signal: expect.any(AbortSignal) });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://acme.example/press/team.jpg', { signal: expect.any(AbortSignal) });
    expect(calls[0]).toMatchObject({ id: 'acme', name: 'press/hero.png', contentType: 'image/png' });
    expect([...(calls[0]?.bytes ?? [])]).toEqual([...payload]);
    // The killed-service property: the result holds host ground only. Nothing
    // in it mentions the service, and no further fetch is owed.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.ok && result.urls.every((u) => u.startsWith('/blobs/'))).toBe(true);
  });

  it('press declared with no seam to hold it refuses, naming the gap', async () => {
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copy(b, 'https://acme.example', undefined, vi.fn() as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain('storePress');
  });

  it('a dead path refuses the whole payload, naming the path', async () => {
    const fetchImpl = vi.fn(async () => new Response('gone', { status: 404 }));
    const { seam } = recordingSeam();
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copy(b, 'https://acme.example', seam, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toBe('press "/integrations/acme/press/hero.png": the service answered 404');
  });

  it('a non-image answer refuses — press is images, says the vocabulary', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
    const { seam } = recordingSeam();
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copy(b, 'https://acme.example', seam, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain('"text/html", which is not an image');
  });

  it('the seam\'s refusal is a refusal — bounds are the host\'s to draw', async () => {
    const fetchImpl = vi.fn(async () => image(new Uint8Array(4)));
    const seam: StorePress = async () => {
      throw new Error('too big for this deployment');
    };
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copy(b, 'https://acme.example', seam, fetchImpl as unknown as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain('too big');
  });

  it('an image that never arrives is given up on, and refuses the bundle naming the path', async () => {
    const service = neverAnswers();
    const { calls, seam } = recordingSeam();
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copy(b, 'https://acme.example', seam, service.fetch, { timeoutMs: 20 });
    expect(result).toEqual({ ok: false, reasons: [expect.stringMatching(/^press "\/integrations\/acme\/press\/hero\.png": TimeoutError/)] });
    expect(calls).toHaveLength(0);
  });

  it('an image larger than the deployment allows is refused where it crosses the line, not once all of it was read', async () => {
    // Eight chunks of a kilobyte, handed over one at a time as they are asked for.
    const pulled: number[] = [];
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        if (pulled.length === 8) controller.close();
        else {
          pulled.push(pulled.length);
          controller.enqueue(new Uint8Array(1024));
        }
      },
    });
    const fetchImpl = async (): Promise<Response> => new Response(body, { status: 200, headers: { 'content-type': 'image/png' } });
    const { calls, seam } = recordingSeam();
    const b = okBundle({ press: ['/integrations/acme/press/hero.png'] });
    const result = await copy(b, 'https://acme.example', seam, fetchImpl, { maxBytes: 2048 });
    expect(result).toEqual({ ok: false, reasons: ['press "/integrations/acme/press/hero.png": larger than 2048 bytes, which is as large as one image may be here'] });
    expect(calls).toHaveLength(0);
    // Given up on at the third kilobyte: the rest was never asked for.
    expect(pulled.length).toBeLessThan(8);
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
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    await pool.query(`INSERT INTO integrations (id, url, offers, needs) VALUES ('acme', 'https://acme.example', '["attendance"]'::jsonb, '["booking"]'::jsonb)`);
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('elder', 'https://elder.example')`);
    const rows = await listIntegrations(registry);
    expect(rows.find((r) => r.id === 'acme')?.offers).toEqual(['attendance']);
    expect(rows.find((r) => r.id === 'acme')?.needs).toEqual(['booking']);
    expect(rows.find((r) => r.id === 'elder')?.offers).toEqual([]);
    expect(rows.find((r) => r.id === 'elder')?.needs).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// capabilities — the verbs an integration gates on, for the host's role
// editor to grant. moss validates shape ({id, title}) and id uniqueness,
// carries them, and reads nothing: the host composes `<integration>.<id>`,
// and every role grants a capability identically.
// ═══════════════════════════════════════════════════════════════

describe('capabilities', () => {
  it('a bundle declaring them lands whole, in order', () => {
    const result = runIntake(
      { integration: 'acme', actions: {}, capabilities: [{ id: 'desk', title: 'Front desk' }, { id: 'billing-view', title: 'See billing' }] },
      ctx(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.capabilities).toEqual([
        { id: 'desk', title: 'Front desk' },
        { id: 'billing-view', title: 'See billing' },
      ]);
    }
  });

  it('a bundle saying nothing parses to an empty array', () => {
    expect(okBundle().capabilities).toEqual([]);
  });

  it('a duplicate id refuses the bundle', () => {
    const result = runIntake(
      { integration: 'acme', actions: {}, capabilities: [{ id: 'desk', title: 'Front desk' }, { id: 'desk', title: 'Also desk' }] },
      ctx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(' ')).toContain('declared twice');
  });

  it('a malformed id refuses the bundle — no dots, no caps, no stray hyphens', () => {
    for (const id of ['Desk', 'desk.view', 'desk-', '-desk', 'desk--view', '']) {
      const result = runIntake({ integration: 'acme', actions: {}, capabilities: [{ id, title: 'x' }] }, ctx());
      expect(result.ok, `id "${id}" should refuse`).toBe(false);
    }
  });

  it('a titleless capability refuses the bundle — the title is all a person sees', () => {
    const result = runIntake({ integration: 'acme', actions: {}, capabilities: [{ id: 'desk', title: '' }] }, ctx());
    expect(result.ok).toBe(false);
  });

  it('an unknown key inside an entry refuses the bundle — strict, no silent gates list', () => {
    const result = runIntake(
      { integration: 'acme', actions: {}, capabilities: [{ id: 'desk', title: 'Front desk', gates: ['ext.desk.acme.x'] }] },
      ctx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(' ')).toContain('capabilities');
  });

  it('the row carries them, and a row predating the column answers empty', async () => {
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    await pool.query(`INSERT INTO integrations (id, url, capabilities) VALUES ('acme', 'https://acme.example', '[{"id":"desk","title":"Front desk"}]'::jsonb)`);
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('elder', 'https://elder.example')`);
    const rows = await listIntegrations(registry);
    expect(rows.find((r) => r.id === 'acme')?.capabilities).toEqual([{ id: 'desk', title: 'Front desk' }]);
    expect(rows.find((r) => r.id === 'elder')?.capabilities).toEqual([]);
  });

  it('a re-import replaces rather than accumulates', async () => {
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    const upsert = (caps: string): Promise<unknown> =>
      pool.query(
        `INSERT INTO integrations (id, url, capabilities) VALUES ('acme', 'https://acme.example', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET capabilities = EXCLUDED.capabilities`,
        [caps],
      );
    await upsert('[{"id":"desk","title":"Front desk"}]');
    await upsert('[{"id":"billing-view","title":"See billing"}]');
    const rows = await listIntegrations(registry);
    expect(rows.find((r) => r.id === 'acme')?.capabilities).toEqual([{ id: 'billing-view', title: 'See billing' }]);
  });
});

describe('configuration — what a builder may set', () => {
  const withConfig = (configuration: unknown[]) => runIntake({ integration: 'acme', actions: {}, configuration }, ctx());

  it('a bundle declaring the four kinds lands whole, in order', () => {
    const configuration = [
      { kind: 'toggle', key: 'waitlist', title: 'Waitlist full classes', description: 'Start a waitlist', default: true },
      { kind: 'number', key: 'weeks-ahead', title: 'Weeks generated', description: '', min: 1, max: 52, default: 8 },
      { kind: 'pick', key: 'rounding', title: 'Rounding', description: '', options: [{ value: 'exact', label: 'Exact' }, { value: 'nearest-5', label: 'Nearest 5' }], default: 'exact' },
      { kind: 'line', key: 'sender-name', title: 'Sender name', description: '', maxLength: 40, default: 'The studio' },
    ];
    const result = withConfig(configuration);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.configuration).toEqual(configuration);
  });

  it('a bundle saying nothing parses to an empty array', () => {
    expect(okBundle().configuration).toEqual([]);
  });

  it('a duplicate key refuses the bundle', () => {
    const result = withConfig([
      { kind: 'toggle', key: 'waitlist', title: 'A', default: true },
      { kind: 'toggle', key: 'waitlist', title: 'B', default: false },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(' ')).toContain('declared twice');
  });

  it('an unknown kind refuses the bundle', () => {
    expect(withConfig([{ kind: 'slider', key: 'x', title: 'X', min: 0, max: 10, default: 5 }]).ok).toBe(false);
  });

  it('a malformed key refuses the bundle — lowercase words joined by single hyphens', () => {
    for (const key of ['Waitlist', 'wait.list', 'waitlist-', '-waitlist', 'wait--list', '']) {
      expect(withConfig([{ kind: 'toggle', key, title: 'X', default: true }]).ok, `key "${key}" should refuse`).toBe(false);
    }
  });

  it('a number with min at or above max, or a default outside them, refuses', () => {
    expect(withConfig([{ kind: 'number', key: 'n', title: 'N', min: 10, max: 10, default: 10 }]).ok).toBe(false);
    expect(withConfig([{ kind: 'number', key: 'n', title: 'N', min: 1, max: 5, default: 9 }]).ok).toBe(false);
  });

  it('a pick with a repeated option value, or a default outside its options, refuses', () => {
    expect(withConfig([{ kind: 'pick', key: 'c', title: 'C', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }], default: 'a' }]).ok).toBe(false);
    expect(withConfig([{ kind: 'pick', key: 'c', title: 'C', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'c' }]).ok).toBe(false);
  });

  it('a line whose default is longer than maxLength refuses', () => {
    expect(withConfig([{ kind: 'line', key: 't', title: 'T', maxLength: 5, default: 'far too long' }]).ok).toBe(false);
  });

  it('the retired kind names (choice, text) are refused after the rename to the shared vocabulary', () => {
    expect(withConfig([{ kind: 'choice', key: 'c', title: 'C', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: 'a' }]).ok).toBe(false);
    expect(withConfig([{ kind: 'text', key: 't', title: 'T', maxLength: 5, default: 'x' }]).ok).toBe(false);
  });

  it('an unknown key inside an entry refuses the bundle — strict', () => {
    const result = withConfig([{ kind: 'toggle', key: 'waitlist', title: 'X', default: true, extra: 1 }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(' ')).toContain('configuration');
  });

  it('the row carries it, and a row predating the column answers empty', async () => {
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    const raw = '[{"kind":"toggle","key":"waitlist","title":"Waitlist","description":"","default":true}]';
    await pool.query(`INSERT INTO integrations (id, url, configuration) VALUES ('acme', 'https://acme.example', $1::jsonb)`, [raw]);
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('elder', 'https://elder.example')`);
    const rows = await listIntegrations(registry);
    expect(rows.find((r) => r.id === 'acme')?.configuration).toEqual([{ kind: 'toggle', key: 'waitlist', title: 'Waitlist', description: '', default: true }]);
    expect(rows.find((r) => r.id === 'elder')?.configuration).toEqual([]);
  });

  it('a re-import replaces rather than accumulates', async () => {
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    const upsert = (config: string): Promise<unknown> =>
      pool.query(
        `INSERT INTO integrations (id, url, configuration) VALUES ('acme', 'https://acme.example', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET configuration = EXCLUDED.configuration`,
        [config],
      );
    await upsert('[{"kind":"toggle","key":"a","title":"A","description":"","default":true}]');
    await upsert('[{"kind":"toggle","key":"b","title":"B","description":"","default":false}]');
    const rows = await listIntegrations(registry);
    expect(rows.find((r) => r.id === 'acme')?.configuration).toEqual([{ kind: 'toggle', key: 'b', title: 'B', description: '', default: false }]);
  });
});

describe('documents — what an add-on lets a person edit', () => {
  const docCtx = () =>
    ctx({
      components: new Map<string, { propsSchema?: unknown }>([
        ['Text', {}],
        ['Card', { propsSchema: z.object({ title: z.string() }).strict() }],
      ]),
      regions: new Set(['host-stage']),
      checks: new Set(['readability']),
    });
  const okDoc = (): Record<string, unknown> => ({
    id: 'website',
    title: 'Website',
    capability: 'build',
    registry: [
      { type: 'hero', label: 'Hero', fields: [{ key: 'title', label: 'Title', kind: 'line' }], fragment: { component: 'Text', children: '$.content.title' } },
    ],
    sections: { open: { max: 20 } },
    publish: { path: '/integrations/acme/publish' },
  });
  const withDocs = (documents: unknown[], capabilities: unknown[] = [{ id: 'build', title: 'Build' }]) =>
    runIntake({ integration: 'acme', actions: {}, capabilities, documents }, docCtx());

  it('a bundle declaring a document lands whole', () => {
    const result = withDocs([okDoc()]);
    expect(result.ok, result.ok ? '' : result.reasons.join('; ')).toBe(true);
    if (result.ok) expect(result.bundle.documents[0]?.id).toBe('website');
  });

  it('a bundle saying nothing parses to an empty array', () => {
    expect(okBundle().documents).toEqual([]);
  });

  it('two documents with one id refuse', () => {
    const r = withDocs([okDoc(), okDoc()]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(' ')).toContain('declared twice');
  });

  it('two fields with one key, or two section types with one type, refuse', () => {
    const dupField = okDoc();
    (dupField.registry as { fields: unknown[] }[])[0]!.fields = [
      { key: 'title', label: 'A', kind: 'line' },
      { key: 'title', label: 'B', kind: 'line' },
    ];
    expect(withDocs([dupField]).ok).toBe(false);

    const dupType = okDoc();
    (dupType as { registry: unknown[] }).registry = [
      { type: 'hero', label: 'A', fields: [{ key: 'a', label: 'A', kind: 'line' }], fragment: { component: 'Text' } },
      { type: 'hero', label: 'B', fields: [{ key: 'b', label: 'B', kind: 'line' }], fragment: { component: 'Text' } },
    ];
    expect(withDocs([dupType]).ok).toBe(false);
  });

  it('a fragment naming a component the app has no component for refuses', () => {
    const d = okDoc();
    (d.registry as { fragment: unknown }[])[0]!.fragment = { component: 'Nope' };
    const r = withDocs([d]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(' ')).toContain('has no component for');
  });

  it('a fragment prop outside the component schema refuses; a binding value has its key checked and value skipped', () => {
    const bad = okDoc();
    (bad.registry as { fragment: unknown }[])[0]!.fragment = { component: 'Card', props: { bogus: 1 } };
    expect(withDocs([bad]).ok).toBe(false);

    const ok = okDoc();
    // `title` is a real prop; its value is a binding, so the value is skipped —
    // the same rule action layouts get.
    (ok.registry as { fragment: unknown }[])[0]!.fragment = { component: 'Card', props: { title: '$.content.title' } };
    expect(withDocs([ok]).ok).toBe(true);
  });

  it('a fixed section whose type is not in the registry, or whose extends names no sibling, refuses', () => {
    const badType = okDoc();
    badType.sections = { fixed: [{ id: 'base', type: 'ghost', label: 'Base' }] };
    expect(withDocs([badType]).ok).toBe(false);

    const badExtends = okDoc();
    badExtends.sections = { fixed: [{ id: 'dark', type: 'hero', label: 'Dark', extends: 'nobody' }] };
    expect(withDocs([badExtends]).ok).toBe(false);

    const good = okDoc();
    good.sections = { fixed: [{ id: 'base', type: 'hero', label: 'Base' }, { id: 'dark', type: 'hero', label: 'Dark', extends: 'base' }] };
    expect(withDocs([good]).ok).toBe(true);
  });

  it('a capability not among the bundle’s own refuses', () => {
    expect(withDocs([okDoc()], []).ok).toBe(false);
  });

  it('a region that is neither an own action nor one the host offers refuses; an own action or host region passes', () => {
    const ghost = okDoc();
    ghost.regions = { stage: 'ghost' };
    expect(withDocs([ghost]).ok).toBe(false);

    const hostRegion = okDoc();
    hostRegion.regions = { stage: 'host-stage' };
    expect(withDocs([hostRegion]).ok).toBe(true);
  });

  it('a check the host does not offer refuses', () => {
    const d = okDoc();
    d.checks = ['nope'];
    expect(withDocs([d]).ok).toBe(false);
  });

  it('a publish path outside the integration’s own prefix refuses', () => {
    const d = okDoc();
    d.publish = { path: '/somewhere/else' };
    expect(withDocs([d]).ok).toBe(false);
  });

  it('a pick field with fewer than two options, and a list field in a section, refuse', () => {
    const pick = okDoc();
    (pick.registry as { fields: unknown[] }[])[0]!.fields = [{ key: 'k', label: 'K', kind: 'pick', options: [{ value: 'a', label: 'A' }] }];
    expect(withDocs([pick]).ok).toBe(false);

    const list = okDoc();
    (list.registry as { fields: unknown[] }[])[0]!.fields = [{ key: 'k', label: 'K', kind: 'list' }];
    expect(withDocs([list]).ok).toBe(false);
  });

  it('the row carries it, and a re-import replaces rather than accumulates', async () => {
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    const one = '[{"id":"a","title":"A","capability":"build","registry":[{"type":"t","label":"T","fields":[{"key":"k","label":"K","kind":"line","hint":"","placeholder":"","group":"","advanced":false,"options":[]}],"starter":{},"fragment":{"component":"Text"}}],"sections":{"open":{"max":5}},"regions":{},"checks":[],"publish":{"path":"/integrations/acme/x"}}]';
    const upsert = (documents: string): Promise<unknown> =>
      pool.query(
        `INSERT INTO integrations (id, url, documents) VALUES ('acme', 'https://acme.example', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET documents = EXCLUDED.documents`,
        [documents],
      );
    await upsert(one);
    await upsert('[]');
    const rows = await listIntegrations(registry);
    expect(rows.find((r) => r.id === 'acme')?.documents).toEqual([]);
    await upsert(one);
    const after = await listIntegrations(registry);
    expect(after.find((r) => r.id === 'acme')?.documents?.[0]?.id).toBe('a');
  });
});

describe('assistants — what an add-on’s assistant knows', () => {
  const minimalDoc = (): Record<string, unknown> => ({
    id: 'website',
    title: 'W',
    capability: 'build',
    registry: [{ type: 't', label: 'T', fields: [{ key: 'k', label: 'K', kind: 'line' }], fragment: { component: 'Text' } }],
    sections: { open: { max: 5 } },
    publish: { path: '/integrations/acme/x' },
  });
  const asstCtx = () =>
    ctx({
      components: new Map<string, { propsSchema?: unknown }>([['Text', {}]]),
      fingerprints: new Set(['deals/table']),
      tools: new Set(['floors', 'derive']),
    });
  const okAssistant = (): Record<string, unknown> => ({
    id: 'brand',
    title: 'Brand assistant',
    instructions: 'Help write the page.',
    applies: { document: 'website' },
  });
  const withAsst = (assistants: unknown[], documents: unknown[] = [minimalDoc()]) =>
    runIntake({ integration: 'acme', actions: {}, capabilities: [{ id: 'build', title: 'Build' }], documents, assistants }, asstCtx());

  it('a bundle declaring an assistant lands whole', () => {
    const r = withAsst([okAssistant()]);
    expect(r.ok, r.ok ? '' : r.reasons.join('; ')).toBe(true);
    if (r.ok) expect(r.bundle.assistants[0]?.id).toBe('brand');
  });

  it('a bundle saying nothing parses to an empty array', () => {
    expect(okBundle().assistants).toEqual([]);
  });

  it('two assistants with one id refuse', () => {
    expect(withAsst([okAssistant(), okAssistant()]).ok).toBe(false);
  });

  it('applies with neither key, or naming a document/screen the bundle lacks, refuses', () => {
    const neither = okAssistant();
    neither.applies = {};
    expect(withAsst([neither]).ok).toBe(false);

    const ghostDoc = okAssistant();
    ghostDoc.applies = { document: 'ghost' };
    expect(withAsst([ghostDoc]).ok).toBe(false);

    const ghostScreen = okAssistant();
    ghostScreen.applies = { screen: 'ext.member.acme.thing' };
    expect(withAsst([ghostScreen]).ok).toBe(false);
  });

  it('a grounding fingerprint the app does not serve refuses; a served one passes', () => {
    const ghost = okAssistant();
    ghost.grounding = [{ as: 'Deals', fingerprint: 'ghost' }];
    expect(withAsst([ghost]).ok).toBe(false);

    const served = okAssistant();
    served.grounding = [{ as: 'Deals', fingerprint: 'deals/table' }];
    expect(withAsst([served]).ok).toBe(true);
  });

  it('a tool the host does not offer refuses', () => {
    const d = okAssistant();
    d.tools = ['nope'];
    expect(withAsst([d]).ok).toBe(false);
  });

  it('a block: a list field is allowed, but a duplicate type, a pick<2, or an unknown fragment component refuse', () => {
    const listOk = okAssistant();
    listOk.blocks = [{ type: 'palette', label: 'Palette', fields: [{ key: 'swatches', label: 'S', kind: 'list' }], fragment: { component: 'Text' } }];
    expect(withAsst([listOk]).ok, 'a list field is allowed inside a block').toBe(true);

    const dupType = okAssistant();
    dupType.blocks = [
      { type: 'p', label: 'P', fields: [], fragment: { component: 'Text' } },
      { type: 'p', label: 'P2', fields: [], fragment: { component: 'Text' } },
    ];
    expect(withAsst([dupType]).ok).toBe(false);

    const badPick = okAssistant();
    badPick.blocks = [{ type: 'p', label: 'P', fields: [{ key: 'k', label: 'K', kind: 'pick', options: [{ value: 'a', label: 'A' }] }], fragment: { component: 'Text' } }];
    expect(withAsst([badPick]).ok).toBe(false);

    const badFragment = okAssistant();
    badFragment.blocks = [{ type: 'p', label: 'P', fields: [], fragment: { component: 'Nope' } }];
    expect(withAsst([badFragment]).ok).toBe(false);
  });

  it('more than six starters refuse', () => {
    const d = okAssistant();
    d.starters = ['1', '2', '3', '4', '5', '6', '7'];
    expect(withAsst([d]).ok).toBe(false);
  });

  it('the row carries it, and a re-import replaces rather than accumulates', async () => {
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    const one = '[{"id":"brand","title":"Brand","intro":"","instructions":"help","grounding":[],"tools":[],"blocks":[],"starters":[],"applies":{"document":"website"},"subject":[]}]';
    const upsert = (assistants: string): Promise<unknown> =>
      pool.query(
        `INSERT INTO integrations (id, url, assistants) VALUES ('acme', 'https://acme.example', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET assistants = EXCLUDED.assistants`,
        [assistants],
      );
    await upsert(one);
    await upsert('[]');
    const rows = await listIntegrations(registry);
    expect(rows.find((r) => r.id === 'acme')?.assistants).toEqual([]);
    await upsert(one);
    const after = await listIntegrations(registry);
    expect(after.find((r) => r.id === 'acme')?.assistants?.[0]?.id).toBe('brand');
  });
});

describe('intakeContextOf — the host vocabulary reaches intake', () => {
  // What the host offers: the kit's components, as the server knows them, and
  // the names the app gave when it created the feature.
  const host: HostVocabulary = {
    components: { Text: {} },
    attachable: { 'member.detail': { membership_id: '$.membershipId' } },
    menuSlots: ['people'],
    assistantTools: ['floors', 'derive'],
    publishChecks: ['readability'],
    editorRegions: ['host-stage'],
  };

  it('maps the manifest vocabulary into the intake context', () => {
    const c = intakeContextOf(host, 'acme', new Set(['deals/table']));
    expect([...(c.tools ?? [])]).toEqual(['floors', 'derive']);
    expect([...(c.checks ?? [])]).toEqual(['readability']);
    expect([...(c.regions ?? [])]).toEqual(['host-stage']);
    expect([...c.menuSlots]).toEqual(['people']);
    expect([...c.attachable]).toEqual(['member.detail']);
    expect(c.components.has('Text')).toBe(true);
    expect(c.fingerprints.has('deals/table')).toBe(true);
  });

  const doc = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'd', title: 'D', capability: 'build',
    registry: [{ type: 't', label: 'T', fields: [{ key: 'k', label: 'K', kind: 'line' }], fragment: { component: 'Text' } }],
    sections: { open: { max: 5 } }, publish: { path: '/integrations/acme/x' }, ...over,
  });

  it('an assistant naming a tool the manifest lists is admitted; one naming another is refused', () => {
    const run = (tools: string[]) =>
      runIntake(
        { integration: 'acme', actions: {}, capabilities: [{ id: 'build', title: 'Build' }], documents: [doc()], assistants: [{ id: 'a', title: 'A', instructions: 'x', tools, applies: { document: 'd' } }] },
        intakeContextOf(host, 'acme', new Set()),
      );
    expect(run(['floors']).ok, 'a listed tool is admitted').toBe(true);
    const bad = run(['telepathy']);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reasons.join(' ')).toContain('not one the host offers');
  });

  it('a document naming a check the manifest lists is admitted; one naming another is refused', () => {
    const run = (checks: string[]) =>
      runIntake(
        { integration: 'acme', actions: {}, capabilities: [{ id: 'build', title: 'Build' }], documents: [doc({ checks })] },
        intakeContextOf(host, 'acme', new Set()),
      );
    expect(run(['readability']).ok, 'a listed check is admitted').toBe(true);
    expect(run(['telekinesis']).ok).toBe(false);
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
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    await pool.query(`INSERT INTO integrations (id, url, status) VALUES ('acme', 'https://acme.example', $1)`, [over.status ?? 'approved']);
    const signer = createAssertionSigner();
    const answered = new Response(JSON.stringify({ erased: true }), { status: 200 });
    const fetchImpl = vi.fn(async () => answered);
    const call = callIntegrationWith({
      forward: createForwarder({
        find: (id) => findIntegration(registry, id),
        resolveIdentity: async () => ({ roles: [], installed: 'installed' in over ? over.installed : ['acme'] }),
        scopeOf: async () => ({ studio_id: 's_1', audience: 'owner' }),
        mint: signer.mint,
        timeoutMs: 30_000,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
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

// ═══════════════════════════════════════════════════════════════
// THE PROBE — every statement the registry ran on `integrations` and
// `integration_actions`, sixteen of them, authored as a vex entry
// (../src/integrations/entries.ts) and run against a real database. One
// database for the cases that write, and each of them writes every row it
// reads, under ids no other case uses: it passes alone, and in any order.
// (Four of them read what an earlier case had left, and failed without it.)
// The lists are read from a database of their own, written once and only
// read. Where a case names SQL, it is the statement the entry stands in for,
// run on the same rows as the oracle.
// ═══════════════════════════════════════════════════════════════

describe('the registry as vex entries — each statement, against a database', () => {
  let pool: PgPool;
  let replay: Replay;
  const rows = async (text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> => (await pool.query(text, values)).rows;
  const json = (value: unknown): string => JSON.stringify(value);

  beforeAll(async () => {
    pool = createPglitePool(freshDatabase());
    replay = await registryOver(pool);
  });

  // What a bundle says of its integration, as the registry hands it over.
  const landing = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    url: `https://${id}.example`,
    title: 'Belts',
    tagline: 'Ranks, live',
    description: 'A paragraph.',
    adds: 'Adds a screen under People.',
    settings_action: `ext.desk.${id}.settings`,
    requested_actions: ['ext.desk.*'],
    requested_data: ['members.read'],
    reach: { [`/integrations/${id}/roster`]: [`ext.desk.${id}.roster`] },
    frames: { [`/integrations/${id}/embed/pay`]: `ext.desk.${id}.pay` },
    phrasebook: { de: { Hello: 'Hallo' } },
    story: [{ heading: 'How it started', prose: 'In a garage.' }],
    highlights: ['Belt colors, live'],
    press: [`/blobs/${id}/hero.png`],
    offers: ['attendance'],
    needs: ['booking'],
    capabilities: [{ id: 'desk', title: 'Front desk' }],
    configuration: [{ key: 'strict', title: 'Strict', description: '', kind: 'toggle', default: false }],
    documents: [],
    assistants: [],
    last_import_at: '2026-10-10T08:00:00.000Z',
    ...over,
  });
  // One action of a bundle, as the list a landing is handed carries it: the
  // row it is kept as is this, with the integration's id.
  const action = (integration: string, name: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    action_id: `ext.desk.${integration}.${name}`,
    definition: { id: `ext.desk.${integration}.${name}`, title: name },
    attach_to: '',
    preview: '',
    place_in: '',
    grammar: { 'nisc.nova': 3 },
    ...over,
  });
  const actionsOf = (integration: string): Promise<Record<string, unknown>[]> => rows('SELECT * FROM integration_actions WHERE integration_id = $1 ORDER BY action_id', [integration]);

  it('1 · find: one integration by its id, and no row for an id that is not there', async () => {
    const reach = { '/integrations/found/roster': ['ext.desk.found.roster'] };
    const frames = { '/integrations/found/embed/pay': 'ext.desk.found.pay' };
    await pool.query(`INSERT INTO integrations (id, url, status, reach, frames) VALUES ('found', 'https://found.example', 'approved', $1::jsonb, $2::jsonb)`, [json(reach), json(frames)]);
    expect(await replay('integrations/find', { id: 'found' })).toEqual([{ url: 'https://found.example', status: 'approved', reach, frames }]);
    expect(await replay('integrations/find', { id: 'found' })).toEqual(await rows('SELECT url, status, reach, frames FROM integrations WHERE id = $1', ['found']));
    expect(await replay('integrations/find', { id: 'ghost' })).toEqual([]);
  });

  it('2 · record a failed import: a row that was not there arrives pending; one that was keeps all but its address and the reason', async () => {
    await replay('integrations/record-failed-import', { id: 'failed', url: 'https://one.example', last_error: 'the service did not answer with a bundle' });
    expect(await rows(`SELECT url, status, title, last_error FROM integrations WHERE id = 'failed'`)).toEqual([
      { url: 'https://one.example', status: 'pending', title: '', last_error: 'the service did not answer with a bundle' },
    ]);
    await pool.query(`UPDATE integrations SET title = 'Kept', status = 'approved', key_hash = 'hash-of-failed' WHERE id = 'failed'`);
    await replay('integrations/record-failed-import', { id: 'failed', url: 'https://two.example', last_error: 'Refused.' });
    expect(await rows(`SELECT url, status, title, key_hash, last_error FROM integrations WHERE id = 'failed'`)).toEqual([
      { url: 'https://two.example', status: 'approved', title: 'Kept', key_hash: 'hash-of-failed', last_error: 'Refused.' },
    ]);
  });

  it('3 · standing: what the row says of approval and of a key', async () => {
    await pool.query(`INSERT INTO integrations (id, url, status, key_hash) VALUES ('keyed', 'https://keyed.example', 'approved', 'abc'), ('unkeyed', 'https://unkeyed.example', 'pending', NULL)`);
    expect(await replay('integrations/standing', { id: 'keyed' })).toEqual([{ status: 'approved', key_hash: 'abc' }]);
    expect(await replay('integrations/standing', { id: 'unkeyed' })).toEqual([{ status: 'pending', key_hash: null }]);
    expect(await replay('integrations/standing', { id: 'ghost' })).toEqual([]);
  });

  // 4, 5, 6 and 7 were four statements, run one after the other. They are one
  // batch now (the case after these holds that it lands whole or not at all).
  it('4 · land a bundle: every column the bundle says, the instant it was handed, and no error', async () => {
    await replay('integrations/land', { ...landing('landed'), actions: [] });
    const { id: _id, last_import_at: _at, ...said } = landing('landed');
    const [first] = await rows(`SELECT * FROM integrations WHERE id = 'landed'`);
    expect(first).toMatchObject({ ...said, id: 'landed', status: 'pending', key_hash: null, approved_data: [], last_error: null });
    expect(new Date(String(first?.['last_import_at'])).toISOString()).toBe('2026-10-10T08:00:00.000Z');

    // Again, on the row that is there: each column is replaced (an empty list
    // lands as an empty list), and what the bundle does not say stays.
    await pool.query(`UPDATE integrations SET status = 'approved', key_hash = 'hash-of-landed', approved_data = '["members.read"]'::jsonb, last_error = 'old' WHERE id = 'landed'`);
    const again = landing('landed', { title: 'Belts 2', requested_data: [], reach: {}, story: [], offers: [], capabilities: [], last_import_at: '2026-10-11T09:30:00.000Z' });
    await replay('integrations/land', { ...again, actions: [] });
    const [second] = await rows(`SELECT * FROM integrations WHERE id = 'landed'`);
    expect(second).toMatchObject({ title: 'Belts 2', requested_data: [], reach: {}, story: [], offers: [], capabilities: [], needs: ['booking'] });
    expect(second).toMatchObject({ status: 'approved', key_hash: 'hash-of-landed', approved_data: ['members.read'], last_error: null });
    expect(new Date(String(second?.['last_import_at'])).toISOString()).toBe('2026-10-11T09:30:00.000Z');
    expect(await rows(`SELECT count(*)::int AS n FROM integrations WHERE id = 'landed'`)).toEqual([{ n: 1 }]);
  });

  it('5, 6 · ...with its actions, in place of the ones it shipped before, and of no other integration’s', async () => {
    const riding = action('landed', 'roster', { attach_to: 'people.detail', preview: '/integrations/landed/preview' });
    const placed = action('landed', 'board', { place_in: 'people.hub' });
    await replay('integrations/land', { ...landing('landed'), actions: [riding, placed] });
    await replay('integrations/land', { ...landing('other'), actions: [action('other', 'roster')] });
    expect(await actionsOf('landed')).toEqual([{ integration_id: 'landed', ...placed }, { integration_id: 'landed', ...riding }]);

    // The next import ships one action: the two before it leave.
    await replay('integrations/land', { ...landing('landed'), actions: [action('landed', 'solo')] });
    expect(await actionsOf('landed')).toEqual([{ integration_id: 'landed', ...action('landed', 'solo') }]);
    // ...and one that ships none leaves none.
    await replay('integrations/land', { ...landing('landed'), actions: [] });
    expect(await actionsOf('landed')).toEqual([]);
    expect(await actionsOf('other')).toEqual([{ integration_id: 'other', ...action('other', 'roster') }]);
  });

  it('7 · ...and with the hash of its key, on the import a key is issued with', async () => {
    await replay('integrations/land-and-keep-key', { ...landing('issued'), key_hash: 'deadbeef', actions: [] });
    expect(await rows(`SELECT id, key_hash FROM integrations WHERE key_hash = 'deadbeef'`)).toEqual([{ id: 'issued', key_hash: 'deadbeef' }]);
    // A row that is there with no key (an import that failed came first) is
    // issued one the same way, with the actions the bundle ships.
    await replay('integrations/record-failed-import', { id: 'late', url: 'https://late.example', last_error: 'Refused.' });
    await replay('integrations/land-and-keep-key', { ...landing('late'), key_hash: 'cafe', actions: [action('late', 'roster')] });
    expect(await rows(`SELECT key_hash, title, last_error FROM integrations WHERE id = 'late'`)).toEqual([{ key_hash: 'cafe', title: 'Belts', last_error: null }]);
    expect(await actionsOf('late')).toEqual([{ integration_id: 'late', ...action('late', 'roster') }]);
  });

  // TWO REGISTRATIONS OF ONE NEW INTEGRATION AT ONCE each found no key, each
  // minted one, and each landed with its own: the later one wrote its hash
  // over the earlier one's, and both were answered a key. One of the two keys
  // was dead on arrival (found on a real Postgres, from two connections, 200
  // times in 200). The key is kept where none is held, and what the landing
  // answers says whether it was.
  it('7 · ...and a row that holds a key keeps it: a landing that comes with another lands its bundle and not its key', async () => {
    const rowsIn = (answered: unknown): unknown[] => (Array.isArray(answered) ? answered : [answered]);
    const keptIn = (answered: unknown, hash: string): boolean => rowsIn(answered).some((row) => typeof row === 'object' && row !== null && 'key_hash' in row && row.key_hash === hash);

    const first = await replay('integrations/land-and-keep-key', { ...landing('raced'), key_hash: 'first-key', actions: [action('raced', 'one')] });
    expect(keptIn(first, 'first-key')).toBe(true);

    const second = await replay('integrations/land-and-keep-key', { ...landing('raced', { title: 'Belts, again' }), key_hash: 'second-key', actions: [action('raced', 'two')] });
    // The bundle landed: it is the later import.
    expect(await rows(`SELECT title, key_hash FROM integrations WHERE id = 'raced'`)).toEqual([{ title: 'Belts, again', key_hash: 'first-key' }]);
    expect(await actionsOf('raced')).toEqual([{ integration_id: 'raced', ...action('raced', 'two') }]);
    // Its key did not, and it is told so.
    expect(keptIn(second, 'second-key')).toBe(false);
    expect(await rows(`SELECT id FROM integrations WHERE key_hash = 'second-key'`)).toEqual([]);
  });

  it('8, 9 · approve: what was asked for is read, and written as what is granted', async () => {
    await pool.query(`INSERT INTO integrations (id, url, requested_data) VALUES ('asking', 'https://asking.example', '["members.read","bookings.read"]'::jsonb)`);
    expect(await replay('integrations/requested', { id: 'asking' })).toEqual([{ requested_data: ['members.read', 'bookings.read'] }]);
    expect(await replay('integrations/requested', { id: 'ghost' })).toEqual([]);
    await replay('integrations/approve', { id: 'asking', approved_data: ['members.read', 'bookings.read'] });
    expect(await rows(`SELECT status, approved_data FROM integrations WHERE id = 'asking'`)).toEqual([{ status: 'approved', approved_data: ['members.read', 'bookings.read'] }]);
    // An approval of nothing asked for grants an empty list, not an object.
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('asking-nothing', 'https://asking-nothing.example')`);
    await replay('integrations/approve', { id: 'asking-nothing', approved_data: [] });
    expect(await rows(`SELECT status, approved_data FROM integrations WHERE id = 'asking-nothing'`)).toEqual([{ status: 'approved', approved_data: [] }]);
  });

  // 10 was the statement that took an approval back when the app could not be
  // served with it. It is gone with its entry: an approval is verified before
  // it is written, from what `integrations/actions-of` reads (below).

  it('11 · remove: the row goes, and its actions with it', async () => {
    await replay('integrations/land', { ...landing('leaving'), actions: [action('leaving', 'roster')] });
    await replay('integrations/land', { ...landing('staying'), actions: [action('staying', 'roster')] });
    expect(await rows(`SELECT count(*)::int AS n FROM integration_actions WHERE integration_id = 'leaving'`)).toEqual([{ n: 1 }]);
    await replay('integrations/remove', { id: 'leaving' });
    expect(await rows(`SELECT id FROM integrations WHERE id = 'leaving'`)).toEqual([]);
    expect(await rows(`SELECT count(*)::int AS n FROM integration_actions WHERE integration_id = 'leaving'`)).toEqual([{ n: 0 }]);
    // And nobody else's: the one beside it keeps its row and its action.
    expect(await actionsOf('staying')).toHaveLength(1);
    // Removing what is not there writes nothing and throws nothing.
    expect(await replay('integrations/remove', { id: 'ghost' })).toEqual([]);
  });

  it('landing a bundle is all or nothing: a failure part-way leaves the rows of the import before it whole', async () => {
    const bundleOf = (title: string, names: readonly string[]): Bundle =>
      BundleSchema.parse({ integration: 'atomic', meta: { title }, actions: Object.fromEntries(names.map((name) => [`ext.desk.atomic.${name}`, { id: `ext.desk.atomic.${name}`, title: name }])) });
    const landingOf = (bundle: Bundle): Landing => ({ id: 'atomic', url: 'https://atomic.example', bundle, adds: '', press: [], stamp: { 'nisc.nova': 3 } });
    const held = async (): Promise<unknown> => ({
      row: await rows(`SELECT * FROM integrations WHERE id = 'atomic'`),
      actions: await rows(`SELECT * FROM integration_actions WHERE integration_id = 'atomic' ORDER BY action_id`),
    });

    await landBundle(replay, landingOf(bundleOf('First', ['one', 'two'])));
    const before = await held();
    expect(before).toMatchObject({ row: [{ title: 'First' }], actions: [{ action_id: 'ext.desk.atomic.one' }, { action_id: 'ext.desk.atomic.two' }] });

    // The same database, through a client on which the statement that writes
    // the actions fails: the row has been written and the old actions taken
    // out by then.
    const broken = await registryOver(pool, failingAt(pool, /^INSERT INTO integration_actions/));
    await expect(landBundle(broken, landingOf(bundleOf('Second', ['three'])))).rejects.toThrow(/the database went away/);
    expect(await held()).toEqual(before);

    // ...and the same import lands whole on a client that works.
    await landBundle(replay, landingOf(bundleOf('Second', ['three'])));
    expect(await held()).toMatchObject({ row: [{ title: 'Second' }], actions: [{ action_id: 'ext.desk.atomic.three' }] });
  });

  it('two integrations cannot hold the hash of one key, and any number can hold none', async () => {
    await replay('integrations/land-and-keep-key', { ...landing('twin-a'), key_hash: 'one-hash', actions: [] });
    await expect(replay('integrations/land-and-keep-key', { ...landing('twin-b'), key_hash: 'one-hash', actions: [] })).rejects.toThrow(/integrations_key_hash_unique/);
    expect(await rows(`SELECT id FROM integrations WHERE key_hash = 'one-hash' OR id = 'twin-b'`)).toEqual([{ id: 'twin-a' }]);
    // A row that holds no key is not held to it: two land with none.
    await replay('integrations/land', { ...landing('keyless-a'), actions: [] });
    await replay('integrations/land', { ...landing('keyless-b'), actions: [] });
    expect(await rows(`SELECT id FROM integrations WHERE id IN ('keyless-a', 'keyless-b') AND key_hash IS NULL ORDER BY id`)).toEqual([{ id: 'keyless-a' }, { id: 'keyless-b' }]);
  });

  // Not one of the sixteen: frame grants were a Map in the process that minted
  // them. They are rows of a table of the feature's own, read and written
  // through vex like the rest.
  it('a frame grant: kept by its hash until its time is over, read back for its own integration, and let go when the next is kept', async () => {
    await replay('integrations/land', { ...landing('framed'), actions: [] });
    const page = '/integrations/framed/embed/pay';
    const kept = (hash: string, now: string, expires: string): Record<string, unknown> => ({ grant_hash: hash, integration_id: 'framed', principal: 'i_mara', path: page, now, expires_at: expires });
    const asked = (over: Record<string, unknown> = {}): Promise<unknown> => replay('integrations/frame-grant', { grant_hash: 'hash-one', integration_id: 'framed', now: '2026-10-10T08:59:59.000Z', ...over });

    await replay('integrations/keep-frame-grant', kept('hash-one', '2026-10-10T08:30:00.000Z', '2026-10-10T09:00:00.000Z'));
    expect(await asked()).toEqual([{ principal: 'i_mara', path: page }]);
    // One answer for a hash nobody kept, another integration's address, and a
    // grant whose time is over: no row.
    expect(await asked({ grant_hash: 'hash-nobody-kept' })).toEqual([]);
    await replay('integrations/land', { ...landing('framed-too'), actions: [] });
    expect(await asked({ integration_id: 'framed-too' })).toEqual([]);
    expect(await asked({ now: '2026-10-10T09:00:00.000Z' })).toEqual([]);

    // Kept after the first one's time: the first is let go in the same write.
    await replay('integrations/keep-frame-grant', kept('hash-two', '2026-10-10T09:30:00.000Z', '2026-10-10T10:00:00.000Z'));
    expect(await rows(`SELECT grant_hash FROM integration_frame_grants WHERE integration_id = 'framed' ORDER BY grant_hash`)).toEqual([{ grant_hash: 'hash-two' }]);
    // A grant is its integration's, and goes when the integration does.
    await replay('integrations/remove', { id: 'framed' });
    expect(await rows(`SELECT grant_hash FROM integration_frame_grants WHERE integration_id = 'framed'`)).toEqual([]);
  });

  describe('the lists', () => {
    const start = { after_integration: '', after_action: '' };
    // A LIST SAYS SOMETHING OF EVERY ROW, so these are read from a database
    // that holds the rows written here and no other: what a case above wrote,
    // and in which order they ran, is not among them. Written once, and each
    // case below only reads.
    let pool: PgPool;
    let replay: Replay;
    const rows = async (text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> => (await pool.query(text, values)).rows;

    beforeAll(async () => {
      pool = createPglitePool(freshDatabase());
      replay = await registryOver(pool);
      // Two approved integrations and one that is pending, each with actions
      // and the hash of a key; and an approved one that ships no action.
      const shipped: Record<string, Record<string, unknown>[]> = {
        alpha: [action('alpha', 'roster', { attach_to: 'people.detail', preview: '/integrations/alpha/preview' }), action('alpha', 'board', { place_in: 'people.hub' })],
        beta: [action('beta', 'strip', { attach_to: 'people.detail' }), action('beta', 'other', { attach_to: 'class.detail', place_in: 'schedule.hub' })],
        gamma: [action('gamma', 'roster', { attach_to: 'people.detail', place_in: 'people.hub' })],
        delta: [],
      };
      for (const [id, status] of [['alpha', 'approved'], ['beta', 'approved'], ['gamma', 'pending'], ['delta', 'approved']] as const) {
        await replay('integrations/land-and-keep-key', { ...landing(id), key_hash: `hash-of-${id}`, actions: shipped[id] ?? [] });
        await pool.query('UPDATE integrations SET status = $2 WHERE id = $1', [id, status]);
      }
    });

    it('12 · the actions of approved integrations that ride a host action', async () => {
      expect(await replay('integrations/attachments', { attach_to: 'people.detail', ...start })).toEqual([
        { integration_id: 'alpha', action_id: 'ext.desk.alpha.roster', preview: '/integrations/alpha/preview' },
        { integration_id: 'beta', action_id: 'ext.desk.beta.strip', preview: '' },
      ]);
      const oracle = await rows(
        `SELECT a.action_id, a.preview FROM integration_actions a JOIN integrations i ON i.id = a.integration_id
          WHERE i.status = 'approved' AND a.attach_to = $1 ORDER BY a.action_id`,
        ['people.detail'],
      );
      expect(z.array(z.object({ action_id: z.string(), preview: z.string() })).parse(await replay('integrations/attachments', { attach_to: 'people.detail', ...start }))).toEqual(oracle);
      expect(await replay('integrations/attachments', { attach_to: 'nothing.rides.this', ...start })).toEqual([]);
    });

    it('13 · the actions of approved integrations that are placed under a hub', async () => {
      expect(await replay('integrations/placements', start)).toEqual([
        { integration_id: 'alpha', action_id: 'ext.desk.alpha.board', place_in: 'people.hub' },
        { integration_id: 'beta', action_id: 'ext.desk.beta.other', place_in: 'schedule.hub' },
      ]);
    });

    it('14 · the approved integration a key hash belongs to, and nobody for a hash that is pending or unknown', async () => {
      expect(await replay('integrations/by-key', { key_hash: 'hash-of-alpha' })).toEqual([{ id: 'alpha' }]);
      expect(await replay('integrations/by-key', { key_hash: 'hash-of-gamma' })).toEqual([]);
      expect(await replay('integrations/by-key', { key_hash: 'nobody' })).toEqual([]);
    });

    it('15 · every integration as the operator sees it, and how many actions each ships', async () => {
      const listed = z.array(z.record(z.string(), z.unknown())).parse(await replay('integrations/list', { after: '' }));
      const counted = z.array(z.object({ integration_id: z.string(), action_count: z.number() })).parse(await replay('integrations/action-counts', { after: '' }));
      const counts = new Map(counted.map((row) => [row.integration_id, row.action_count]));
      const together: Record<string, unknown>[] = listed.map((row) => ({ ...row, action_count: counts.get(String(row['id'])) ?? 0 }));
      // The statement the two entries stand in for: one list, each row with
      // its count, an integration that ships no action counted as none.
      const oracle = await rows(`
        SELECT i.id, i.url, i.status, i.title, i.tagline, i.adds, i.settings_action,
               i.requested_actions, i.requested_data, i.approved_data,
               i.offers, i.needs, i.capabilities, i.configuration, i.documents, i.assistants,
               i.last_import_at, i.last_error,
               (SELECT count(*) FROM integration_actions a WHERE a.integration_id = i.id)::int AS action_count
          FROM integrations i ORDER BY i.id`);
      expect(together).toEqual(oracle);
      expect(together.find((row) => row['id'] === 'alpha')?.['action_count']).toBe(2);
      expect(together.find((row) => row['id'] === 'delta')?.['action_count']).toBe(0);
      expect(together.map((row) => row['id'])).toEqual(['alpha', 'beta', 'delta', 'gamma']);
      // A page starts after the key it is handed.
      const later = z.array(z.object({ id: z.string() })).parse(await replay('integrations/list', { after: 'beta' }));
      expect(later.map((row) => row.id)).toEqual(['delta', 'gamma']);
      const countedLater = await replay('integrations/action-counts', { after: 'alpha' });
      expect(countedLater).toEqual(await rows(`SELECT integration_id, count(*)::int AS action_count FROM integration_actions WHERE integration_id > 'alpha' GROUP BY integration_id ORDER BY integration_id`));
      expect(countedLater).toContainEqual({ integration_id: 'beta', action_count: 2 });
      expect(countedLater).not.toContainEqual(expect.objectContaining({ integration_id: 'alpha' }));
    });

    it('16 · the stored actions of every approved integration, and a page that starts after an action', async () => {
      const stored = z.array(z.object({ integration_id: z.string(), action_id: z.string(), definition: z.unknown(), grammar: z.unknown() })).parse(await replay('integrations/stored-actions', start));
      expect(stored.map((row) => row.action_id)).toEqual(['ext.desk.alpha.board', 'ext.desk.alpha.roster', 'ext.desk.beta.other', 'ext.desk.beta.strip']);
      expect(stored[0]).toEqual({ integration_id: 'alpha', action_id: 'ext.desk.alpha.board', definition: { id: 'ext.desk.alpha.board', title: 'board' }, grammar: { 'nisc.nova': 3 } });
      const oracle = await rows(
        `SELECT a.action_id, a.definition, a.grammar FROM integration_actions a
           JOIN integrations i ON i.id = a.integration_id
          WHERE i.status = 'approved' ORDER BY a.integration_id, a.action_id`,
      );
      expect(stored.map(({ integration_id: _integration, ...row }) => row)).toEqual(oracle);
      // After the second action of alpha: the rest of that order, across the
      // integration's edge.
      expect(z.array(z.object({ action_id: z.string() })).parse(await replay('integrations/stored-actions', { after_integration: 'alpha', after_action: 'ext.desk.alpha.roster' })).map((row) => row.action_id)).toEqual([
        'ext.desk.beta.other',
        'ext.desk.beta.strip',
      ]);
    });

    it('what one integration shipped, approved or not: what is verified before it is approved', async () => {
      // gamma is pending, so no list above serves its action.
      expect(await replay('integrations/actions-of', { id: 'gamma', ...start })).toEqual([
        { integration_id: 'gamma', action_id: 'ext.desk.gamma.roster', definition: { id: 'ext.desk.gamma.roster', title: 'roster' }, grammar: { 'nisc.nova': 3 } },
      ]);
      expect(z.array(z.object({ action_id: z.string() })).parse(await replay('integrations/actions-of', { id: 'alpha', ...start })).map((row) => row.action_id)).toEqual(['ext.desk.alpha.board', 'ext.desk.alpha.roster']);
      expect(await replay('integrations/actions-of', { id: 'alpha', after_integration: 'alpha', after_action: 'ext.desk.alpha.board' })).toHaveLength(1);
      expect(await replay('integrations/actions-of', { id: 'ghost', ...start })).toEqual([]);
    });
  });
});
