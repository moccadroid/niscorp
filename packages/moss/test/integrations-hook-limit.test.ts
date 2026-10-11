import { describe, it, expect, vi, afterEach } from 'vitest';
import { createForwarder } from '../src/integrations/forward';
import { proxyRoutes } from '../src/integrations/proxy';
import type { FoundIntegration } from '../src/integrations/registry';

// THE WEBHOOK DOOR'S LIMIT (../src/integrations/proxy.ts), held to what the
// documents say it is: 240 calls a minute for each integration, counted by the
// process that takes them.
//
// No database: the registry is a map, and the vendor's call goes nowhere.

const approved: FoundIntegration = { url: 'https://vendor.example/', status: 'approved', reach: {} };

// One process's door: the routes, over a forwarder of its own.
const door = (): { hook: (id: string) => Promise<number>; sent: () => number } => {
  const send = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{}', { status: 200 }));
  const routes = proxyRoutes({
    grantedActionIds: () => [],
    forward: createForwarder({
      find: async (id) => (id === 'pay' || id === 'belts' ? approved : undefined),
      resolveIdentity: async () => ({ roles: [], installed: undefined }),
      scopeOf: async () => ({}),
      mint: () => 'unused',
      timeoutMs: 30_000,
      fetch: send,
    }),
  });
  return {
    hook: async (id) => (await routes.request(`/integrations/${id}/hook/events`, { method: 'POST', body: '{}' })).status,
    sent: () => send.mock.calls.length,
  };
};

const times = async (count: number, call: () => Promise<number>): Promise<number[]> => {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) statuses.push(await call());
  return statuses;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('the webhook door’s limit', () => {
  it('240 calls a minute reach an integration; the next is 429 and is not forwarded', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-11T12:00:00Z'), toFake: ['Date'] });
    const { hook, sent } = door();
    expect((await times(240, () => hook('pay'))).every((status) => status === 200)).toBe(true);
    expect(await hook('pay')).toBe(429);
    expect(sent()).toBe(240);
  });

  it('it is counted for each integration: one that is over leaves another served', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-11T12:00:00Z'), toFake: ['Date'] });
    const { hook } = door();
    await times(241, () => hook('pay'));
    expect(await hook('belts')).toBe(200);
  });

  it('a minute after the first call of a window, the count starts again', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-11T12:00:00Z'), toFake: ['Date'] });
    const { hook } = door();
    await times(241, () => hook('pay'));
    vi.setSystemTime(new Date('2026-10-11T12:00:59.999Z'));
    expect(await hook('pay')).toBe(429);
    vi.setSystemTime(new Date('2026-10-11T12:01:00Z'));
    expect(await hook('pay')).toBe(200);
  });

  // The count is in the memory of the process that takes the call. Two
  // processes behind one address each allow 240: a vendor is let through up to
  // twice as often, however the balancer splits its calls.
  it('IT IS A LIMIT PER PROCESS: a second process counts from nothing', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-11T12:00:00Z'), toFake: ['Date'] });
    const one = door();
    const other = door();
    await times(240, () => one.hook('pay'));
    expect(await one.hook('pay')).toBe(429);
    expect((await times(240, () => other.hook('pay'))).every((status) => status === 200)).toBe(true);
    expect(one.sent() + other.sent()).toBe(480);
  });

  it('an integration nobody approved is 404 before anything is counted', async () => {
    const { hook, sent } = door();
    expect(await hook('ghost')).toBe(404);
    expect(sent()).toBe(0);
  });
});
