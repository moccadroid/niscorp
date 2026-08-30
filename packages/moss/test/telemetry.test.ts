// TELEMETRY — the moss half of the observability case. Every span in the
// system is built by moss and handed to one runtime hook; these install a
// capturing emitter at each seam and pin what it receives:
//   - vex.execute:      vex's record → a span, principal PRESENCE only, no
//                       scope value ever crossing into the attributes;
//   - fn.call:          one span per in-process function invocation;
//   - integration.call: one span per outbound call, refusal included;
//   - shell.build:      one span per build, a rebuild marked reset;
//   - socket.upgrade / socket.close: admitted, refused, and lifetime.
//
// And the two doctrines the case turns on: a throwing sink costs the request
// nothing, and an unconfigured sink is asked for nothing.
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { ExecuteRecord } from '@niscorp/vex';
import { vexRecordToSpan } from '../src/server';
import { createShellHost, instrumentFunctions } from '../src/shells';
import type { ShellHostContext } from '../src/shells';
import { callIntegrationWith, initIntegrations } from '../src/integrations';
import { createAssertionSigner } from '../src/assert';
import { createSocket } from '../src/socket';
import type { Connection, ServerMessage, SocketContext } from '../src/socket';
import type { NiscApp } from '../src/app';
import type { TelemetrySpan } from '../src/telemetry';
import type { ScopePolicy } from '@niscorp/vex';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const capture = () => {
  const spans: TelemetrySpan[] = [];
  return { spans, telemetry: { emit: (s: TelemetrySpan) => spans.push(s) } };
};

// ── vex.execute: the record → span mapping, which is where the privacy rule
// lives. vex hands moss the scope; moss must take PRESENCE from it and nothing
// else. ──────────────────────────────────────────────────────────────────────
describe('vexRecordToSpan', () => {
  it('maps a read to a vex.execute span — and leaks no scope value', () => {
    const rec: ExecuteRecord = {
      kind: 'query',
      status: 'ok',
      fingerprint: 'deals/table',
      cacheHit: true,
      rows: 3,
      startUnixNano: 1_000,
      endUnixNano: 2_000,
      scope: { userId: 'usr_1', studioId: 'st_9', email: 'a@b.co' },
    };
    const span = vexRecordToSpan(rec);
    expect(span.name).toBe('vex.execute');
    expect(span.status).toBe('ok');
    expect(span.startUnixNano).toBe(1_000);
    expect(span.endUnixNano).toBe(2_000);
    expect(span.attributes).toEqual({ op: 'query', hasPrincipal: true, fingerprint: 'deals/table', cache: 'hit', rows: 3 });
    // The point of the whole doctrine: no tenant, no address, no principal id.
    expect(Object.values(span.attributes)).not.toContain('st_9');
    expect(Object.values(span.attributes)).not.toContain('usr_1');
    expect(Object.values(span.attributes)).not.toContain('a@b.co');
  });

  it('machinery carries no principal — hasPrincipal is false', () => {
    const span = vexRecordToSpan({ kind: 'mutation', status: 'ok', rows: 1, startUnixNano: 0, endUnixNano: 1, scope: {} });
    expect(span.attributes['op']).toBe('mutation');
    expect(span.attributes['hasPrincipal']).toBe(false);
  });

  it('a refusal keeps its fingerprint and reach, and reads as refused', () => {
    const span = vexRecordToSpan({ kind: 'query', status: 'refused', fingerprint: 'gated', reach: 'personal', startUnixNano: 0, endUnixNano: 1, scope: { userId: 'usr_1' } });
    expect(span.status).toBe('refused');
    expect(span.attributes['fingerprint']).toBe('gated');
    expect(span.attributes['reach']).toBe('personal');
  });
});

// ── fn.call: the in-process dispatch wrapper. ────────────────────────────────
describe('fn.call', () => {
  it('one span per invocation, naming the fn and nothing it was given', async () => {
    const { spans, telemetry } = capture();
    const wrapped = instrumentFunctions({ recount: async () => ({ total: 7 }) }, telemetry.emit, 'usr_1');
    const out = await wrapped['recount']!({ secret: 'do-not-log' }, new AbortController().signal);
    expect(out).toEqual({ total: 7 });
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'fn.call', status: 'ok', attributes: { fn: 'recount', hasPrincipal: true } });
    expect(JSON.stringify(spans[0])).not.toContain('do-not-log');
  });

  it('a throwing handler is an error span, and the throw still propagates', async () => {
    const { spans, telemetry } = capture();
    const wrapped = instrumentFunctions({ boom: async () => { throw new Error('nope'); } }, telemetry.emit, null);
    await expect(wrapped['boom']!({}, new AbortController().signal)).rejects.toThrow('nope');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'fn.call', status: 'error', attributes: { fn: 'boom', hasPrincipal: false } });
  });
});

// ── integration.call: the outbound seam, refusals included. ──────────────────
describe('integration.call', () => {
  const world = async (over: { status?: string; telemetry?: SocketContext['telemetry'] } = {}) => {
    const pool = createPglitePool(new PGlite());
    await initIntegrations(pool);
    await pool.query(`INSERT INTO integrations (id, url, status) VALUES ('acme', 'https://acme.example', $1)`, [over.status ?? 'approved']);
    const signer = createAssertionSigner();
    const call = callIntegrationWith({
      pool,
      installedFor: async () => ['acme'],
      scopeValuesFor: async () => ({ studio_id: 's_1' }),
      mint: signer.mint,
      fetchImpl: (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch,
      ...(over.telemetry !== undefined ? { telemetry: over.telemetry } : {}),
    });
    return { call };
  };

  it('an answered call is one ok span with addon, path, and httpStatus', async () => {
    const { spans, telemetry } = capture();
    const { call } = await world({ telemetry });
    await call('acme', 'lifecycle/ping', { principal: 'i_mara' });
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'integration.call', status: 'ok', attributes: { addon: 'acme', path: 'lifecycle/ping', httpStatus: 200 } });
  });

  it('a refused call is one refused span, with no httpStatus (nobody answered)', async () => {
    const { spans, telemetry } = capture();
    const { call } = await world({ status: 'pending', telemetry });
    await expect(call('acme', 'lifecycle/ping', { principal: 'i_mara' })).rejects.toThrow(/not approved/);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe('refused');
    expect(spans[0]!.attributes).not.toHaveProperty('httpStatus');
  });

  it('no sink configured → not one span is built', async () => {
    const { call } = await world();
    const response = await call('acme', 'lifecycle/ping', { principal: 'i_mara' });
    expect(response.status).toBe(200); // structural: it simply works, unobserved
  });

  it('a throwing sink costs the call nothing — it still answers', async () => {
    const { call } = await world({ telemetry: { emit: () => { throw new Error('sink down'); } } });
    const response = await call('acme', 'lifecycle/ping', { principal: 'i_mara' });
    expect(response.status).toBe(200);
  });
});

// ── shell.build: reusing the shell-host harness shape. ───────────────────────
describe('shell.build', () => {
  const counter = { id: 'counter', data: { n: 0 }, triggers: [] };
  const app = { charter: { public: ['counter'] }, assignments: {}, actions: { counter }, shell: { canvases: [{ id: 'main', initial: 'counter' }] } } as unknown as NiscApp;
  const policy: ScopePolicy = { default: 'deny', entities: {} };
  const ctxWith = (telemetry: ShellHostContext['runtime']['telemetry']): ShellHostContext => ({
    app,
    catalogFor: () => ({ ids: ['counter'], hash: 'h' }),
    variantsFor: () => new Map(),
    resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, catalog: { ids: ['counter'], hash: 'h' }, variants: new Map(), policy }),
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    runtime: { telemetry } as ShellHostContext['runtime'],
  });

  it('a principal build is one shell.build span, not a reset', async () => {
    const { spans, telemetry } = capture();
    await createShellHost(ctxWith(telemetry)).session('t', 'usr_1');
    const build = spans.filter((s) => s.name === 'shell.build');
    expect(build).toHaveLength(1);
    expect(build[0]).toMatchObject({ status: 'ok', attributes: { reset: false, hasPrincipal: true } });
  });

  it('an anonymous build reads hasPrincipal false', async () => {
    const { spans, telemetry } = capture();
    await createShellHost(ctxWith(telemetry)).session(null, null);
    expect(spans.find((s) => s.name === 'shell.build')?.attributes['hasPrincipal']).toBe(false);
  });

  it('a reset is a build marked reset', async () => {
    const { spans, telemetry } = capture();
    const host = createShellHost(ctxWith(telemetry));
    const session = await host.session('t', 'usr_1');
    session.reset();
    await tick();
    await tick();
    expect(spans.some((s) => s.name === 'shell.build' && s.attributes['reset'] === true)).toBe(true);
  });
});

// ── socket.upgrade / socket.close: a tiny fake transport. A closure over its
// data, like every other fake here — and it keeps EVERY onClose handler, which
// a single-slot fake would drop (open registers three), taking the close span
// with them.
const fakeConnection = (): Connection & { sent: ServerMessage[] } => {
  const sent: ServerMessage[] = [];
  const onCls: Array<() => void> = [];
  return {
    sent,
    send: (text) => void sent.push(JSON.parse(text) as ServerMessage),
    close: () => { for (const fn of onCls) fn(); },
    onMessage: () => {},
    onClose: (fn) => void onCls.push(fn),
  };
};

describe('socket telemetry', () => {
  const ctxWith = (telemetry: SocketContext['telemetry']): SocketContext => ({
    session: (token) => (token === 'good' ? 'usr_1' : null),
    catalog: () => ({ ids: [], hash: 'h' }),
    telemetry,
  });

  it('an admitted connection is an ok upgrade, and its close carries the lifetime', async () => {
    const { spans, telemetry } = capture();
    const accept = createSocket(ctxWith(telemetry));
    const conn = fakeConnection();
    await accept('/socket?token=good', conn);
    const upgrade = spans.find((s) => s.name === 'socket.upgrade');
    expect(upgrade).toMatchObject({ status: 'ok', attributes: { hasPrincipal: true } });
    conn.close();
    const close = spans.find((s) => s.name === 'socket.close');
    expect(close).toMatchObject({ status: 'ok', attributes: { hasPrincipal: true } });
    expect(close!.endUnixNano).toBeGreaterThanOrEqual(close!.startUnixNano);
  });

  it('an invalid token is a refused upgrade and no admission', async () => {
    const { spans, telemetry } = capture();
    await createSocket(ctxWith(telemetry))('/socket?token=bad', fakeConnection());
    expect(spans.filter((s) => s.name === 'socket.upgrade')).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'socket.upgrade', status: 'refused', attributes: { hasPrincipal: false } });
    expect(spans.some((s) => s.name === 'socket.close')).toBe(false);
  });

  it('anonymous is admitted, hasPrincipal false', async () => {
    const { spans, telemetry } = capture();
    await createSocket(ctxWith(telemetry))('/socket', fakeConnection());
    expect(spans.find((s) => s.name === 'socket.upgrade')?.attributes['hasPrincipal']).toBe(false);
  });
});
