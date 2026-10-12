import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { guardOperator, secretsEqual } from '../src/server/routes';

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
    expect(seen).toContain('/operator/integrations');
  });

  it('a gate that returns a Response refuses BEFORE moss’s key check', async () => {
    const server = prefix({ key: 'K', gate: () => new Response('nope', { status: 401 }) });
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
    await call(server, 'K');
    await call(server, 'WRONG');
    expect(outcomes).toEqual([200, 404]);
  });

  it('the seam can only harden: a passing gate still faces moss’s key check', async () => {
    const server = prefix({ key: 'K', gate: async (_c, next) => void (await next()) });
    expect((await call(server, 'K')).status).toBe(200);
    expect((await call(server, 'WRONG')).status).toBe(404);
  });
});
