import { Hono } from 'hono';
import { z } from 'zod';
import type { FetchFn } from '@niscorp/nova';
import type { FeatureEnv, FeatureSeams, PrincipalIdentity } from '../feature';
import { emitterOf, spanClock } from '../runtime';
import type { Telemetry } from '../runtime';
import type { AssertionSigner } from './credentials';
import { reachAdmits } from './reach';
import type { FoundIntegration } from './registry';

export type ForwardDeps = {
  find: (id: string) => Promise<FoundIntegration | undefined>;
  resolveIdentity: (principal: string) => Promise<PrincipalIdentity>;
  scopeOf: (principal: string) => Promise<Record<string, unknown>>;
  mint: AssertionSigner['mint'];
  timeoutMs: number;
  fetch?: typeof fetch;
};

type Outbound = {
  integration: string;
  path: string;
};

type ForSomebody = Outbound & {
  principal: string;
  scope?: Record<string, unknown>;
  admits?: (found: FoundIntegration, caller: PrincipalIdentity) => boolean;
  request: (assertion: string) => RequestInit | Promise<RequestInit>;
};

type ForNobody = Outbound & {
  principal?: undefined;
  admits?: (found: FoundIntegration) => boolean;
  request: () => RequestInit | Promise<RequestInit>;
};

export type Forward = ForSomebody | ForNobody;

export type Forwarded =
  | { kind: 'answered'; response: Response }
  | { kind: 'refused'; why: 'unknown' | 'uninstalled' | 'inadmissible' }
  | { kind: 'refused'; why: 'unapproved'; status: string }
  | { kind: 'unreachable'; error: unknown };

export type Forwarder = (call: Forward) => Promise<Forwarded>;

export const createForwarder = (deps: ForwardDeps): Forwarder => {
  const send = deps.fetch ?? fetch;
  const sent = async (url: string, request: () => RequestInit | Promise<RequestInit>): Promise<Forwarded> => {
    try {
      const init = await request();
      return { kind: 'answered', response: await send(url, { ...init, signal: AbortSignal.timeout(deps.timeoutMs) }) };
    } catch (error) {
      return { kind: 'unreachable', error };
    }
  };
  return async (call) => {
    const found = await deps.find(call.integration);
    if (found === undefined) return { kind: 'refused', why: 'unknown' };
    if (found.status !== 'approved') return { kind: 'refused', why: 'unapproved', status: found.status };
    const url = `${found.url.replace(/\/$/, '')}/${call.path}`;

    if (call.principal === undefined) {
      if (call.admits !== undefined && !call.admits(found)) return { kind: 'refused', why: 'inadmissible' };
      return sent(url, call.request);
    }
    const principal = call.principal;
    const caller = await deps.resolveIdentity(principal);
    if (caller.installed !== undefined && !caller.installed.includes(call.integration)) return { kind: 'refused', why: 'uninstalled' };
    if (call.admits !== undefined && !call.admits(found, caller)) return { kind: 'refused', why: 'inadmissible' };
    const assertion = deps.mint({ integration: call.integration, principal, scope: { ...(await deps.scopeOf(principal)), ...(call.scope ?? {}) } });
    return sent(url, () => call.request(assertion));
  };
};

export const relayed = (response: Response, otherwise: string, more: Record<string, string> = {}): Response =>
  new Response(response.body, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? otherwise, ...more } });

const HOOK_LIMIT = 240;
const HOOK_WINDOW_MS = 60_000;

const createHookLimit = (): ((id: string, now: number) => boolean) => {
  const hits = new Map<string, { count: number; resets: number }>();
  return (id, now) => {
    const seen = hits.get(id);
    if (seen === undefined || now >= seen.resets) {
      hits.set(id, { count: 1, resets: now + HOOK_WINDOW_MS });
      return true;
    }
    seen.count += 1;
    return seen.count <= HOOK_LIMIT;
  };
};

export type ProxyDeps = {
  grantedActionIds: FeatureSeams['grantedActionIds'];
  forward: Forwarder;
};

const webhook = (deps: ProxyDeps, routes: Hono<FeatureEnv>): void => {
  const hookAllows = createHookLimit();
  routes.post('/integrations/:id/hook/*', async (c) => {
    const id = c.req.param('id');
    // Read from the url: c.req.path drops the query.
    const here = new URL(c.req.url);
    const headers = new Headers(c.req.raw.headers);
    // A bearer arriving here must not read as an identity on the other side.
    headers.delete('authorization');
    headers.delete('host');
    const ended = await deps.forward({
      integration: id,
      admits: () => hookAllows(id, Date.now()),
      path: `${here.pathname.split('/').slice(3).join('/')}${here.search}`,
      // The body goes on as the bytes that arrived: the vendor's signature is over exactly those.
      request: async () => ({ method: 'POST', headers, body: await c.req.arrayBuffer() }),
    });
    if (ended.kind === 'refused') {
      // The same 404 for unknown and unapproved: a stranger probing learns nothing of either.
      return ended.why === 'inadmissible' ? c.json({ message: 'Too many.' }, 429) : c.json({ message: 'Not found.' }, 404);
    }
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    return relayed(ended.response, 'application/json');
  });
};

const proxy = (deps: ProxyDeps, routes: Hono<FeatureEnv>): void => {
  routes.all('/integrations/:id/*', async (c) => {
    const principal = c.get('principal');
    if (principal === null) return c.json({ message: 'Sign in first.' }, 401);
    const id = c.req.param('id');
    const here = new URL(c.req.url);
    const ended = await deps.forward({
      integration: id,
      principal,
      admits: (found, caller) => reachAdmits(found.reach, c.req.path, new Set(deps.grantedActionIds(caller.roles, caller.installed))),
      path: `${here.pathname.split('/').slice(3).join('/')}${here.search}`,
      request: async (assertion) => ({
        method: c.req.method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
        ...(c.req.method === 'GET' ? {} : { body: await c.req.text() }),
      }),
    });
    if (ended.kind === 'refused') return c.json({ message: ended.why === 'uninstalled' ? 'Not installed here.' : 'No such integration.' }, 404);
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    return relayed(ended.response, 'application/json');
  });
};

export const proxyRoutes = (deps: ProxyDeps): Hono<FeatureEnv> => {
  const routes = new Hono<FeatureEnv>();
  // The webhook first: the proxy's /integrations/:id/* would match its path and demand a principal.
  webhook(deps, routes);
  proxy(deps, routes);
  return routes;
};

export type CallIntegration = (
  id: string,
  path: string,
  init: { principal: string; method?: string; body?: unknown; scope?: Record<string, unknown> },
) => Promise<Response>;

export const callIntegrationWith = (deps: {
  forward: Forwarder;
  telemetry?: Telemetry;
}): CallIntegration => {
  const emit = emitterOf(deps.telemetry);
  return async (id, path, init) => {
    const clock = emit === undefined ? undefined : spanClock();
    const done = (status: 'ok' | 'error' | 'refused', httpStatus?: number): void => {
      if (emit === undefined || clock === undefined) return;
      emit({
        name: 'integration.call',
        startUnixNano: clock.startUnixNano,
        endUnixNano: clock.endUnixNano(),
        status,
        attributes: { integration: id, path, ...(httpStatus !== undefined ? { httpStatus } : {}) },
      });
    };

    // No reach gate, on purpose: reach fences what a screen may call, and this call has no screen.
    const ended = await deps.forward({
      integration: id,
      principal: init.principal,
      ...(init.scope === undefined ? {} : { scope: init.scope }),
      path: path.replace(/^\/+/, ''),
      request: (assertion) => ({
        method: init.method ?? 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      }),
    });
    if (ended.kind === 'unreachable') {
      done('error');
      throw ended.error;
    }
    if (ended.kind === 'refused') {
      done('refused');
      const why =
        ended.why === 'unapproved'
          ? `not approved (status "${ended.status}").`
          : ended.why === 'uninstalled'
            ? `not installed for "${init.principal}".`
            : 'no such integration.';
      throw new Error(`moss: callIntegration("${id}"): ${why}`);
    }
    done(ended.response.ok ? 'ok' : 'error', ended.response.status);
    return ended.response;
  };
};

const INTEGRATION_PATH = /^\/integrations\/([a-z][a-z0-9-]*)\//;

const SaidSchema = z.looseObject({ message: z.string() });

export const withFallbackMessage = (inner: FetchFn): FetchFn => async (url, init) => {
  const integration = INTEGRATION_PATH.exec(url)?.[1];
  if (integration === undefined) return inner(url, init);

  const fallback = (status: number): Awaited<ReturnType<FetchFn>> => {
    const body = { message: `The ${integration} integration is not answering right now. The rest of the app is unaffected.` };
    return { ok: false, status, json: async () => body, text: async () => JSON.stringify(body) };
  };

  let reply: Awaited<ReturnType<FetchFn>>;
  try {
    reply = await inner(url, init);
  } catch {
    return fallback(502);
  }
  if (reply.ok) return reply;

  try {
    const body: unknown = await reply.json();
    const said = SaidSchema.safeParse(body);
    // The proxy's own generic sentence is replaced like silence: it names no integration.
    if (said.success && said.data.message !== 'The integration is unreachable.') {
      return { ok: false, status: reply.status, json: async () => body, text: async () => JSON.stringify(body) };
    }
  } catch {
    // A body that is not JSON says nothing.
  }
  return fallback(reply.status);
};
