import type { Hono } from 'hono';
import type { FetchFn } from '@niscorp/nova';
import { VEX_LIVE_ENV } from '@niscorp/vex/hono';
import { createWireFollower } from '../data';
import type { Env } from './moss-server';

// THE INTERNAL WIRE: the server's own surfaces, asked in process as the
// session whose token this is. A server shell's endpoint calls ride it — same
// wire, same enforcement: the shell is just another client.
export const wireOver =
  (server: Hono<Env>) =>
  (token: string | null): FetchFn =>
  async (url, init) => {
    const isVex = url.split('?')[0]?.endsWith('/vex') === true;
    // A vex read made for a caller that can be told when to stop — a
    // nova endpoint passes its instance's signal — may keep answering
    // (`refresh: 'reactive'`; see ../data, follow.ts). The follower rides the
    // in-process request's env, where no network request can put one.
    const follower = isVex && init?.signal !== undefined ? createWireFollower(init.signal) : undefined;
    const res = await server.request(
      url,
      {
        method: init?.method ?? 'GET',
        headers: { ...(init?.headers ?? {}), ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
        ...(init?.body !== undefined ? { body: init.body } : {}),
      },
      follower === undefined ? undefined : { [VEX_LIVE_ENV]: follower.live },
    );
    // Vex replies `{ result, meta }`; endpoints want the data — the
    // same unwrap the client wire applies, so an action behaves
    // identically under either shell.
    if (!isVex || !res.ok) {
      follower?.end();
      return res;
    }
    const body: unknown = await res.json();
    const result = body !== null && typeof body === 'object' && 'result' in body ? body.result : body;
    follower?.handedOver();
    return {
      ok: res.ok,
      status: res.status,
      json: () => Promise.resolve(result),
      text: () => Promise.resolve(JSON.stringify(result)),
      ...(follower === undefined ? {} : { onChange: follower.onChange }),
    };
  };
