import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { VEX_LIVE_ENV } from '@niscorp/vex/hono';
import type { Env } from '../src/server/moss-server';
import { createInternalWire } from '../src/server/wire';

// THE WIRE A SERVER SHELL'S ENDPOINT CALLS RIDE (../src/server/wire.ts): the
// server's own surfaces, asked in process as the session whose token it was
// made for. The server here is three routes that say what they were asked;
// nothing of moss stands behind them.

// What a route was handed beside the request: the follower a vex read may
// keep answering through, when the wire made one.
const liveOf = (env: unknown): { signal: AbortSignal } | undefined => {
  if (env === null || typeof env !== 'object' || !(VEX_LIVE_ENV in env)) return undefined;
  const live: unknown = Reflect.get(env, VEX_LIVE_ENV);
  if (live === null || typeof live !== 'object' || !('signal' in live) || !(live.signal instanceof AbortSignal)) return undefined;
  return { signal: live.signal };
};

const serverSaying = () => {
  const server = new Hono<Env>();
  const followed: ({ signal: AbortSignal } | undefined)[] = [];
  server.all('/who', async (c) => c.json({ authorization: c.req.header('authorization') ?? null, method: c.req.method, sent: await c.req.text() }));
  server.post('/api/vex', (c) => {
    followed.push(liveOf(c.env));
    return c.json({ result: [{ id: 1 }], meta: { cache: 'hit' } });
  });
  server.post('/api/refused/vex', (c) => {
    followed.push(liveOf(c.env));
    return c.json({ error: 'forbidden', message: 'Not yours to read.' }, 403);
  });
  return { wire: createInternalWire(server), followed };
};

describe('the server’s own wire — who a call is made as', () => {
  it('a session’s call carries its token as a Bearer, and nobody’s carries none', async () => {
    const { wire } = serverSaying();
    expect(await (await wire('the-sessions-token')('/who')).json()).toMatchObject({ authorization: 'Bearer the-sessions-token', method: 'GET' });
    expect(await (await wire(null)('/who')).json()).toMatchObject({ authorization: null });
  });

  // AN ENDPOINT MAY DECLARE HEADERS, and an action is data somebody else may
  // have written (an integration's bundle). Whatever it says of
  // `Authorization`, the call is made as the session whose screen it is: the
  // session's token goes over the endpoint's own headers, or a screen would
  // read and write as whoever its author named.
  it('an endpoint that declares its own `Authorization` is still made as the session', async () => {
    const { wire } = serverSaying();
    const answered = await wire('the-sessions-token')('/who', { method: 'POST', headers: { Authorization: 'Bearer somebody-elses', 'content-type': 'application/json' }, body: '{"n":1}' });
    expect(await answered.json()).toEqual({ authorization: 'Bearer the-sessions-token', method: 'POST', sent: '{"n":1}' });
  });
});

describe('the server’s own wire — a vex read', () => {
  it('is handed back as its result, without the envelope vex answers in', async () => {
    const { wire } = serverSaying();
    const answered = await wire('t')('/api/vex?live=1', { method: 'POST', body: '{}' });
    expect(answered).toMatchObject({ ok: true, status: 200 });
    expect(await answered.json()).toEqual([{ id: 1 }]);
    expect(await answered.text()).toBe('[{"id":1}]');
  });

  it('made for a caller that can say when to stop, it can be followed; made for one that cannot, it is answered once', async () => {
    const { wire, followed } = serverSaying();
    const call = new AbortController();
    const reactive = await wire('t')('/api/vex', { method: 'POST', body: '{}', signal: call.signal });
    expect(typeof reactive.onChange).toBe('function');
    expect(followed[0]?.signal.aborted).toBe(false);
    // The caller is done: the follow ends with it.
    reactive.onChange?.(() => undefined);
    call.abort();
    expect(followed[0]?.signal.aborted).toBe(true);

    const once = await wire('t')('/api/vex', { method: 'POST', body: '{}' });
    expect(once.onChange).toBeUndefined();
    expect(followed[1]).toBeUndefined();
  });

  // A READ THAT WAS REFUSED IS NOT FOLLOWED. It is handed back as it was
  // answered, and what would have kept it answering is ended at once.
  it('that was refused is handed back as it was answered, and nothing follows it', async () => {
    const { wire, followed } = serverSaying();
    const refused = await wire('t')('/api/refused/vex', { method: 'POST', body: '{}', signal: new AbortController().signal });
    expect(refused).toMatchObject({ ok: false, status: 403 });
    expect(await refused.json()).toEqual({ error: 'forbidden', message: 'Not yours to read.' });
    expect(refused.onChange).toBeUndefined();
    expect(followed[0]?.signal.aborted).toBe(true);
  });
});
