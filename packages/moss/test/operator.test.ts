import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { guardOperator, secretsEqual } from '../src/server';

// ═══════════════════════════════════════════════════════════════
// The operator prefix's two gates, tested through the seam moss uses to install
// them (guardOperator) rather than a full server boot — the ordering IS the
// security property, so it is what these hold:
//
//   1. moss's key check is CONSTANT-TIME (secretsEqual), so a short or wrong
//      guess is not refused faster than a correct-length one.
//   2. an app-supplied gate runs BEFORE moss's key check and AROUND moss's own
//      routes — including /operator/integrations, the exact path an app's own
//      after-mounted middleware could never reach.
// ═══════════════════════════════════════════════════════════════

// A prefix built the way createServer builds it: guardOperator, then a route
// standing in for moss's own (/integrations) — the one an app cannot otherwise
// govern. `new Hono()` is untyped here; guardOperator wants Hono<Env>, and Env
// is server-private, so the cast is the test admitting it does not carry the
// app's Variables (the gate reads none of them).
const prefix = (opts: Parameters<typeof guardOperator>[1]): Hono => {
  const operator = new Hono();
  guardOperator(operator as unknown as Parameters<typeof guardOperator>[0], opts);
  operator.get('/integrations', (c) => c.text('moss'));
  const server = new Hono();
  server.route('/operator', operator);
  return server;
};

const call = async (server: Hono, key?: string): Promise<Response> =>
  server.request('/operator/integrations', key === undefined ? {} : { headers: { 'x-operator-key': key } });

describe('secretsEqual — constant-time credential compare', () => {
  it('accepts an exact match', () => {
    expect(secretsEqual('st_operator_key', 'st_operator_key')).toBe(true);
  });

  it('rejects a wrong key of the same length', () => {
    expect(secretsEqual('st_operator_key', 'st_operator_kez')).toBe(false);
  });

  it('rejects a differing-length guess WITHOUT throwing', () => {
    // The whole reason for hashing both sides first: timingSafeEqual throws on a
    // length mismatch, so a bare compare would refuse a short guess by crashing
    // (and a length pre-check would leak the key's length). Neither happens.
    expect(() => secretsEqual('short', 'a-considerably-longer-guess-entirely')).not.toThrow();
    expect(secretsEqual('short', 'a-considerably-longer-guess-entirely')).toBe(false);
  });
});

describe('guardOperator — moss’s key check', () => {
  it('with no gate: correct key passes, wrong key and no key both 404', async () => {
    const server = prefix({ key: 'K' });
    expect((await call(server, 'K')).status).toBe(200);
    expect((await call(server, 'WRONG')).status).toBe(404);
    expect((await call(server)).status).toBe(404);
  });

  it('an unset key keeps every route 404, even past a passing gate', async () => {
    const server = prefix({ key: '', gate: async (_c, next) => void (await next()) });
    expect((await call(server, '')).status).toBe(404);
    expect((await call(server, 'anything')).status).toBe(404);
  });
});

describe('guardOperator — the app gate governs the whole prefix', () => {
  it('runs for moss’s own route, not only app-registered ones', async () => {
    const seen: string[] = [];
    const server = prefix({
      key: 'K',
      gate: async (c, next) => {
        seen.push(c.req.path);
        await next();
      },
    });
    const res = await call(server, 'K');
    expect(res.status).toBe(200);
    // The exact case the measurement table found unreachable, inverted.
    expect(seen).toContain('/operator/integrations');
  });

  it('a gate that returns a Response refuses BEFORE moss’s key check', async () => {
    const server = prefix({ key: 'K', gate: () => new Response('nope', { status: 401 }) });
    // Even WITH the correct key, the app's refusal stands and moss's route never runs.
    expect((await call(server, 'K')).status).toBe(401);
  });

  it('can await next and observe moss’s OUTCOME — the audit path a pre-only gate cannot', async () => {
    const outcomes: number[] = [];
    const server = prefix({
      key: 'K',
      gate: async (c, next) => {
        await next();
        outcomes.push(c.res.status);
      },
    });
    await call(server, 'K'); // moss serves it: 200
    await call(server, 'WRONG'); // moss refuses it: 404
    // The gate saw both real results, not just that a request was attempted.
    expect(outcomes).toEqual([200, 404]);
  });

  it('the seam can only harden: a passing gate still faces moss’s key check', async () => {
    // Gate lets everything through; moss's wrong-key 404 still stands.
    const server = prefix({ key: 'K', gate: async (_c, next) => void (await next()) });
    expect((await call(server, 'K')).status).toBe(200);
    expect((await call(server, 'WRONG')).status).toBe(404);
  });
});
