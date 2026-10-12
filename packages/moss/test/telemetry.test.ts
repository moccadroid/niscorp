import { describe, it, expect, vi } from 'vitest';
import type { ExecuteRecord } from '@niscorp/vex';
import { vexRecordToSpan } from '../src/data/engine';
import { instrumentFunctions } from '../src/shells/sessions';
import { hostConfig, standHost } from './shell-host-double';
import type { HostSetup } from './shell-host-double';
import { callIntegrationWith } from '../src/integrations/forward';
import { createForwarder } from '../src/integrations/forward';
import type { FoundIntegration } from '../src/integrations/registry';
import { createAssertionSigner } from '../src/integrations/credentials';
import { createSocket } from '../src/socket';
import type { Connection } from '../src/socket';
import type { SocketConfig } from '../src/socket/socket';
import { PROTOCOL, offerToken } from '../src/protocol';
import type { ServerMessage } from '../src/protocol';
import type { NiscApp } from '../src/manifest';
import type { TelemetrySpan } from '../src/runtime';
import { turn } from './turn';

const tick = turn;
const capture = () => {
  const spans: TelemetrySpan[] = [];
  return { spans, telemetry: { emit: (s: TelemetrySpan) => spans.push(s) } };
};

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

describe('integration.call', () => {
  const world = async (over: { status?: string; telemetry?: SocketConfig['telemetry'] } = {}) => {
    const acme: FoundIntegration = { url: 'https://acme.example', status: over.status ?? 'approved', reach: {} };
    const signer = createAssertionSigner();
    const call = callIntegrationWith({
      forward: createForwarder({
        find: async (id) => (id === 'acme' ? acme : undefined),
        resolveIdentity: async () => ({ roles: [], installed: ['acme'] }),
        scopeOf: async () => ({ studio_id: 's_1' }),
        mint: signer.mint,
        timeoutMs: 30_000,
        fetch: (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch,
      }),
      ...(over.telemetry !== undefined ? { telemetry: over.telemetry } : {}),
    });
    return { call };
  };

  it('an answered call is one ok span with integration, path, and httpStatus', async () => {
    const { spans, telemetry } = capture();
    const { call } = await world({ telemetry });
    await call('acme', 'lifecycle/ping', { principal: 'i_mara' });
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'integration.call', status: 'ok', attributes: { integration: 'acme', path: 'lifecycle/ping', httpStatus: 200 } });
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
    expect(response.status).toBe(200);
  });

  it('a throwing sink costs the call nothing — it still answers', async () => {
    const { call } = await world({ telemetry: { emit: () => { throw new Error('sink down'); } } });
    const response = await call('acme', 'lifecycle/ping', { principal: 'i_mara' });
    expect(response.status).toBe(200);
  });
});

describe('shell.build', () => {
  const counter = { id: 'counter', data: { n: 0 }, triggers: [] };
  const app = { charter: { public: ['counter'] }, assignments: {}, actions: { counter }, shell: { canvases: [{ id: 'main', initial: 'counter' }] } } as unknown as NiscApp;
  const ctxWith = (telemetry: NonNullable<HostSetup['telemetry']>): HostSetup => ({
    app,
    resolve: async () => ({ roles: ['public'], scope: {}, catalog: { ids: ['counter'], hash: 'h' }, variants: new Map() }),
    wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
    telemetry,
  });

  it('a principal build is one shell.build span, not a reset', async () => {
    const { spans, telemetry } = capture();
    await standHost(hostConfig(ctxWith(telemetry))).session('t', 'usr_1');
    const build = spans.filter((s) => s.name === 'shell.build');
    expect(build).toHaveLength(1);
    expect(build[0]).toMatchObject({ status: 'ok', attributes: { reset: false, hasPrincipal: true } });
  });

  it('an anonymous build reads hasPrincipal false', async () => {
    const { spans, telemetry } = capture();
    await standHost(hostConfig(ctxWith(telemetry))).session(null, null);
    expect(spans.find((s) => s.name === 'shell.build')?.attributes['hasPrincipal']).toBe(false);
  });

  it('a reset is a build marked reset', async () => {
    const { spans, telemetry } = capture();
    const host = standHost(hostConfig(ctxWith(telemetry)));
    const session = await host.session('t', 'usr_1');
    session.reset();
    await tick();
    await tick();
    expect(spans.some((s) => s.name === 'shell.build' && s.attributes['reset'] === true)).toBe(true);
  });
});

// Keeps every onClose handler: opening registers three, and a single slot would drop the close span.
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
  const ctxWith = (telemetry: SocketConfig['telemetry']): SocketConfig => ({
    session: (token) => (token === 'good' ? 'usr_1' : null),
    catalog: () => ({ ids: [], hash: 'h' }),
    telemetry,
  });

  it('an admitted connection is an ok upgrade, and its close carries the lifetime', async () => {
    const { spans, telemetry } = capture();
    const accept = createSocket(ctxWith(telemetry));
    const conn = fakeConnection();
    await accept(`/socket?protocol=${PROTOCOL}`, { ...conn, upgrade: { offered: offerToken('good') } });
    const upgrade = spans.find((s) => s.name === 'socket.upgrade');
    expect(upgrade).toMatchObject({ status: 'ok', attributes: { hasPrincipal: true } });
    conn.close();
    const close = spans.find((s) => s.name === 'socket.close');
    expect(close).toMatchObject({ status: 'ok', attributes: { hasPrincipal: true } });
    expect(close!.endUnixNano).toBeGreaterThanOrEqual(close!.startUnixNano);
  });

  it('an invalid token is a refused upgrade and no admission', async () => {
    const { spans, telemetry } = capture();
    await createSocket(ctxWith(telemetry))(`/socket?protocol=${PROTOCOL}`, { ...fakeConnection(), upgrade: { offered: offerToken('bad') } });
    expect(spans.filter((s) => s.name === 'socket.upgrade')).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'socket.upgrade', status: 'refused', attributes: { hasPrincipal: false } });
    expect(spans.some((s) => s.name === 'socket.close')).toBe(false);
  });

  it.each([
    ['the verifier cannot be asked', { session: () => { throw new Error('the session store is unreachable'); } }, false],
    ['what they hold cannot be asked', { catalog: () => { throw new Error('the database is down'); } }, true],
    ['their shell cannot be built', { shells: { session: async () => { throw new Error('a definition failed'); } } }, true],
  ] satisfies [string, Partial<SocketConfig>, boolean][])('a session that could not be opened because %s is an upgrade that failed', async (_label, failing, hasPrincipal) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { spans, telemetry } = capture();
    await createSocket({ ...ctxWith(telemetry), ...failing })(`/socket?protocol=${PROTOCOL}`, { ...fakeConnection(), upgrade: { offered: offerToken('good') } });
    logged.mockRestore();
    const upgrades = spans.filter((s) => s.name === 'socket.upgrade');
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]).toMatchObject({ status: 'error', attributes: { hasPrincipal } });
  });

  it('anonymous is admitted, hasPrincipal false', async () => {
    const { spans, telemetry } = capture();
    await createSocket(ctxWith(telemetry))(`/socket?protocol=${PROTOCOL}`, fakeConnection());
    expect(spans.find((s) => s.name === 'socket.upgrade')?.attributes['hasPrincipal']).toBe(false);
  });
});
