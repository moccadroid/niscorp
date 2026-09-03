import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
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
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    await pool.query(`INSERT INTO integrations (id, url, capabilities) VALUES ('acme', 'https://acme.example', '[{"id":"desk","title":"Front desk"}]'::jsonb)`);
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('elder', 'https://elder.example')`);
    const rows = await listIntegrations(pool);
    expect(rows.find((r) => r.id === 'acme')?.capabilities).toEqual([{ id: 'desk', title: 'Front desk' }]);
    expect(rows.find((r) => r.id === 'elder')?.capabilities).toEqual([]);
  });

  it('a re-import replaces rather than accumulates', async () => {
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    const upsert = (caps: string): Promise<unknown> =>
      pool.query(
        `INSERT INTO integrations (id, url, capabilities) VALUES ('acme', 'https://acme.example', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET capabilities = EXCLUDED.capabilities`,
        [caps],
      );
    await upsert('[{"id":"desk","title":"Front desk"}]');
    await upsert('[{"id":"billing-view","title":"See billing"}]');
    const rows = await listIntegrations(pool);
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
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    const raw = '[{"kind":"toggle","key":"waitlist","title":"Waitlist","description":"","default":true}]';
    await pool.query(`INSERT INTO integrations (id, url, configuration) VALUES ('acme', 'https://acme.example', $1::jsonb)`, [raw]);
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('elder', 'https://elder.example')`);
    const rows = await listIntegrations(pool);
    expect(rows.find((r) => r.id === 'acme')?.configuration).toEqual([{ kind: 'toggle', key: 'waitlist', title: 'Waitlist', description: '', default: true }]);
    expect(rows.find((r) => r.id === 'elder')?.configuration).toEqual([]);
  });

  it('a re-import replaces rather than accumulates', async () => {
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    const upsert = (config: string): Promise<unknown> =>
      pool.query(
        `INSERT INTO integrations (id, url, configuration) VALUES ('acme', 'https://acme.example', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET configuration = EXCLUDED.configuration`,
        [config],
      );
    await upsert('[{"kind":"toggle","key":"a","title":"A","description":"","default":true}]');
    await upsert('[{"kind":"toggle","key":"b","title":"B","description":"","default":false}]');
    const rows = await listIntegrations(pool);
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
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    const one = '[{"id":"a","title":"A","capability":"build","registry":[{"type":"t","label":"T","fields":[{"key":"k","label":"K","kind":"line","hint":"","placeholder":"","group":"","advanced":false,"options":[]}],"starter":{},"fragment":{"component":"Text"}}],"sections":{"open":{"max":5}},"regions":{},"checks":[],"publish":{"path":"/integrations/acme/x"}}]';
    const upsert = (documents: string): Promise<unknown> =>
      pool.query(
        `INSERT INTO integrations (id, url, documents) VALUES ('acme', 'https://acme.example', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET documents = EXCLUDED.documents`,
        [documents],
      );
    await upsert(one);
    await upsert('[]');
    const rows = await listIntegrations(pool);
    expect(rows.find((r) => r.id === 'acme')?.documents).toEqual([]);
    await upsert(one);
    const after = await listIntegrations(pool);
    expect(after.find((r) => r.id === 'acme')?.documents?.[0]?.id).toBe('a');
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
