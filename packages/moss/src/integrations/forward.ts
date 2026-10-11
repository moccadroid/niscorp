import { Hono } from 'hono';
import { z } from 'zod';
import type { FetchFn } from '@niscorp/nova';
import type { FeatureEnv, FeatureSeams, PrincipalIdentity } from '../feature';
import { emitterOf, spanClock } from '../runtime';
import type { Telemetry } from '../runtime';
import type { AssertionSigner } from './credentials';
import { reachAdmits } from './reach';
import type { FoundIntegration } from './registry';

// ═══════════════════════════════════════════════════════════════
// ONE WAY OUT. Three doors reach an integration's own service: a vendor's
// webhook, a screen's call through the proxy, and the deployment's own call
// when nobody is driving. Each takes the same steps, in the same order:
//
//   find the integration; refuse unless it is approved; refuse unless it is
//   installed for whoever the call is for; say who that is in an assertion;
//   fetch; hand back what was answered.
//
// They are written once, here. What a door decides for itself it still
// decides: what it asks before it gets here, the gate of its own it puts
// between "installed" and the assertion (the reach, a rate limit), the request
// it sends, and what it tells its caller for each way a call can end. This
// function answers which way it ended and words nothing.
// ═══════════════════════════════════════════════════════════════

export type ForwardDeps = {
  find: (id: string) => Promise<FoundIntegration | undefined>;
  // Who a call is made for: the roles a reach is decided by, and the
  // integrations live for their tenant.
  resolveIdentity: (principal: string) => Promise<PrincipalIdentity>;
  // The scope values a principal carries: the ones the engine pins rows by.
  scopeOf: (principal: string) => Promise<Record<string, unknown>>;
  mint: AssertionSigner['mint'];
  // How long a call may take, in ms, its answer and its body together. Past
  // it the call is given up on, and ends as `unreachable` like any call no
  // answer came back from. Every door is bounded here, so none can forget.
  timeoutMs: number;
  fetch?: typeof fetch;
};

// What every call says, whoever it is for.
type Outbound = {
  integration: string;
  // Where under the integration's own address the call goes.
  path: string;
};

// A CALL MADE FOR SOMEBODY. It must be installed for their tenant, and it
// carries an assertion that says who they are.
type ForSomebody = Outbound & {
  principal: string;
  // Scope values the deployment vouches for itself, laid over the principal's.
  scope?: Record<string, unknown>;
  // The door's own gate, asked once the integration is found, approved and
  // installed, and before anything is minted: a call it does not admit gets no
  // credential, not even one that would have died at the other end.
  admits?: (found: FoundIntegration, caller: PrincipalIdentity) => boolean;
  // The request, built once it is known that the call goes out. `assertion` is
  // the token the door sends as `authorization: Bearer …`.
  request: (assertion: string) => RequestInit | Promise<RequestInit>;
};

// A CALL MADE FOR NOBODY (a vendor's webhook). No install is asked about and
// NO ASSERTION IS MINTED, so nothing on the call can be read as an identity.
type ForNobody = Outbound & {
  principal?: undefined;
  admits?: (found: FoundIntegration) => boolean;
  request: () => RequestInit | Promise<RequestInit>;
};

export type Forward = ForSomebody | ForNobody;

export type Forwarded =
  // The service answered, whatever it answered.
  | { kind: 'answered'; response: Response }
  // Nothing was sent. `unknown`: no such integration. `unapproved`: it is
  // there and nobody has approved it (`status` is what its row says).
  // `uninstalled`: not live for this principal's tenant. `inadmissible`: the
  // door's own gate said no.
  | { kind: 'refused'; why: 'unknown' | 'uninstalled' | 'inadmissible' }
  | { kind: 'refused'; why: 'unapproved'; status: string }
  // It was sent and no answer came back, or none came back in time.
  | { kind: 'unreachable'; error: unknown };

export type Forwarder = (call: Forward) => Promise<Forwarded>;

export const createForwarder = (deps: ForwardDeps): Forwarder => {
  const send = deps.fetch ?? fetch;
  // The request is built inside the same guard as the fetch: a body that
  // cannot be read is a call that did not go out.
  //
  // NO CALL WAITS FOR EVER. Each goes out with a signal that fires when it has
  // taken `timeoutMs`: a service that never answers is given up on, and so is
  // one whose answer never ends, because the signal goes on holding while the
  // body is read by whoever the answer is handed to.
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

// What the service answered, handed on as it came: its status, its body, and
// its own content type (`otherwise` when it named none). Nothing else of its
// headers crosses.
export const relayed = (response: Response, otherwise: string, more: Record<string, string> = {}): Response =>
  new Response(response.body, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? otherwise, ...more } });

// ═══════════════════════════════════════════════════════════════
// THE WEBHOOK DOOR, AND THE PROXY — everything under `/integrations/<id>/`:
// a vendor calling in, and a screen calling out.
//
// The webhook is mounted first, because the proxy's `/integrations/:id/*`
// would otherwise match first and demand a principal.
// ═══════════════════════════════════════════════════════════════

// A DOOR WE DID NOT LOCK NEEDS A LIMIT. Every other surface is bounded by a
// credential; the webhook is bounded by the vendor behaving.
//
// IT IS A LIMIT PER PROCESS, AND SAYS SO: 240 calls a minute for each
// integration, counted in the memory of the process that takes them, in
// windows of a minute that start at a window's first call. A deployment of N
// processes behind one address lets a vendor through up to N × 240 times a
// minute, however its balancer splits the calls, and a process that restarts
// counts from nothing. It bounds what one process forwards; it is not a
// ceiling for the deployment. One that held across processes needs a store
// they share, a write for every call a vendor makes, and moss keeps none for
// this: a deployment that needs that ceiling sets it where its processes
// meet, at its proxy. Neither number is a setting.
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

// ── THE WEBHOOK DOOR ─────────────────────────────────────────
//
// The only unauthenticated surface on this server that DOES something, and it
// is narrow on purpose.
//
// A vendor calling in has no session and no key — it could not have one, since
// nobody is driving. So identity does not travel here at all: no principal is
// required and NO ASSERTION IS MINTED. The integration authenticates the
// caller itself, against the vendor's own signature, which is the only party
// that can vouch for a call moss cannot.
//
// THE BODY ARRIVES BYTE-IDENTICAL. A signature is computed over exact bytes,
// and a JSON round-trip through this process would re-order one key and break
// every verification downstream. Nothing on this path parses the body — it is
// read as an ArrayBuffer and handed on.
const webhook = (deps: ProxyDeps, routes: Hono<FeatureEnv>): void => {
  const hookAllows = createHookLimit();
  routes.post('/integrations/:id/hook/*', async (c) => {
    const id = c.req.param('id');
    const here = new URL(c.req.url);
    // Every header the vendor set travels, because the signature is in one of
    // them and moss does not know which. `authorization` is dropped: this path
    // mints no identity, and a bearer arriving here must not read as one on the
    // other side. `host` would name us rather than them.
    const headers = new Headers(c.req.raw.headers);
    headers.delete('authorization');
    headers.delete('host');
    const ended = await deps.forward({
      integration: id,
      admits: () => hookAllows(id, Date.now()),
      path: `${here.pathname.split('/').slice(3).join('/')}${here.search}`,
      request: async () => ({ method: 'POST', headers, body: await c.req.arrayBuffer() }),
    });
    if (ended.kind === 'refused') {
      // 404 for "no such integration" AND for "not approved yet" — the same
      // answer, so a stranger probing this learns nothing about which integrations a
      // deployment is currently considering.
      return ended.why === 'inadmissible' ? c.json({ message: 'Too many.' }, 429) : c.json({ message: 'Not found.' }, 404);
    }
    // A vendor reads 502 as "retry me", which is what we want: the delivery
    // is not lost, it is deferred until the integration is back.
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    return relayed(ended.response, 'application/json');
  });
};

// THE PROXY.
//
// Identity travels INSIDE a signed assertion, never as bare headers. The
// token carries the integration it is for, the principal, the same scope
// values the resolver gives vex for `$scope`, and an expiry seconds out —
// signed with the deployment's key, whose public half the integration holds.
// A claim outside a verified envelope is not refused over there; it simply
// is not identity, which is what makes the safe path the only path. The
// body stays caller-controlled and untrusted, exactly as a vex `$context`
// is: an integration that reads `studio_id` from the body trusts the caller,
// whatever is signed.
const proxy = (deps: ProxyDeps, routes: Hono<FeatureEnv>): void => {
  routes.all('/integrations/:id/*', async (c) => {
    const principal = c.get('principal');
    if (principal === null) return c.json({ message: 'Sign in first.' }, 401);
    const id = c.req.param('id');
    // THE QUERY TRAVELS. `c.req.path` drops it, and an endpoint declared with
    // `?view=summary` that arrived without it would have the integration answer
    // a different question than the screen asked.
    const here = new URL(c.req.url);
    const ended = await deps.forward({
      integration: id,
      principal,
      // THE DECLARATION IS THE PERIMETER (./reach.ts). Being signed in where
      // an integration is installed is permission to call the paths its bundle
      // declared, and nothing is forwarded for the rest of what its service
      // serves: its internals, its admin verbs, whatever it grows next.
      //
      // AND ONLY THE ONES THIS CALLER'S OWN SCREENS DECLARE. Reach is the union
      // over every action in the bundle, and the charter's `ext.desk.*` fence
      // decides which screens a person has: so a path is forwarded for
      // whoever holds an action that declares it. The catalog is the one the
      // shell is built from, so a door and the screen that opens it agree.
      //
      // Checked BEFORE the assertion is minted: an inadmissible path gets no
      // credential, not even one that would have died at the other end.
      admits: (found, caller) => reachAdmits(found.reach, c.req.path, new Set(deps.grantedActionIds(caller.roles, caller.installed))),
      path: `${here.pathname.split('/').slice(3).join('/')}${here.search}`,
      request: async (assertion) => ({
        method: c.req.method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
        ...(c.req.method === 'GET' ? {} : { body: await c.req.text() }),
      }),
    });
    // 404 rather than 403 for every refusal: what somebody may not reach, they
    // do not learn the existence of.
    if (ended.kind === 'refused') return c.json({ message: ended.why === 'uninstalled' ? 'Not installed here.' : 'No such integration.' }, 404);
    // An integration that is down is an ordinary condition: the action's
    // onError shows the sentence and nothing is claimed.
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    // What the integration answered WITH, not what we assumed it answered with.
    return relayed(ended.response, 'application/json');
  });
};

export const proxyRoutes = (deps: ProxyDeps): Hono<FeatureEnv> => {
  const routes = new Hono<FeatureEnv>();
  webhook(deps, routes);
  proxy(deps, routes);
  return routes;
};

// ── the outbound act ─────────────────────────────────────────
//
// Call an installed integration when nobody is driving — the outbound mirror
// of `executeAs`. Auth, the outbox sweep, an erase propagating across every
// ledger: acts the DEPLOYMENT performs, with no request in flight and no
// principal mid-click. The proxy cannot carry them (it needs both), and
// handing an app the signer would hand it the two gates below to re-implement
// wrongly once — so the narrow verb is the surface.
//
// Two deliberate differences from the proxy:
//
//   NOT GATED BY REACH. Reach fences what a screen may cause a browser to
//   reach — a fence around actions — and a lifecycle verb is not an action
//   and has no screen. Reach is derived from declared endpoints, so it could
//   never admit an undeclared verb anyway; the integration gates the call
//   itself, on the verified claims (principal and scope — there is no other
//   field in the envelope; see ./credentials.ts).
//
//   THE PRINCIPAL IS THE PERSON WHO ACTED, so the owner who pressed erase is
//   who the other ledger sees. A machinery principal would make every
//   integration's owner check pass or fail on a name that belongs to no one.
//
// The two gates that stay: approved, and installed for this principal's
// tenant. Refusals THROW with a sentence — the caller is the deployment's own
// orchestrator, and a state error is something it must see, not a status to
// mistake for the integration's answer. What the integration answers comes
// back as the Response, whatever it is; an unreachable service rejects, and a
// sweep's whole job is to retry.
//
// One ordering the gate forces on the app: an erase retried after the
// integration was UNINSTALLED refuses forever — rightly, no credential for an
// uninstalled integration — so an orchestrator sequences erasure ahead of
// uninstall's row retirement, or drains pending erases first.

export type CallIntegration = (
  id: string,
  path: string,
  init: { principal: string; method?: string; body?: unknown; scope?: Record<string, unknown> },
) => Promise<Response>;

export const callIntegrationWith = (deps: {
  // The one way out (`createForwarder` above): the two gates, the scope values with
  // `init.scope` laid over them, and the assertion are its to do.
  forward: Forwarder;
  // The deployment's telemetry sink, if any: one `integration.call` span per
  // outbound call, naming the integration, the path, and the answer's status.
  telemetry?: Telemetry;
}): CallIntegration => {
  const emit = emitterOf(deps.telemetry);
  return async (id, path, init) => {
    const clock = emit === undefined ? undefined : spanClock();
    // A refusal or answer, as one span. `httpStatus` is present only when the
    // add-on actually answered; a guard refusal and an unreachable service both
    // carry none, distinguished by `status`.
    const done = (status: 'ok' | 'error' | 'refused', httpStatus?: number): void => {
      if (emit === undefined || clock === undefined) return;
      emit({
        name: 'integration.call',
        startUnixNano: clock.startUnixNano,
        endUnixNano: clock.endUnixNano(),
        status,
        attributes: { addon: id, path, ...(httpStatus !== undefined ? { httpStatus } : {}) },
      });
    };

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

// ── THE MESSAGE UNDER A FAILING INTEGRATION ─────────────────────────
//
// Somebody else's service being down is an ordinary condition, and the screen
// in front of it belongs to a person, not an operator. A reply that carries no
// `message` falls through to the terminal's bare `HTTP 500`: a status code in
// front of a customer. So the session's wire puts a SENTENCE under every call
// to an integration: it names the integration and says the rest is unaffected.
// A reply that DOES carry a message passes through untouched (the
// integration's own words win), and no other path pays anything.
const INTEGRATION_PATH = /^\/integrations\/([a-z][a-z0-9-]*)\//;

// WHAT A FAILED REPLY SAYS FOR ITSELF, read by a schema: the body is another
// service's JSON. It says something when it is an object with a `message` that
// is text; whatever else it carries is its own, and is served on as it came.
const SaidSchema = z.looseObject({ message: z.string() });

export const withFallbackMessage = (inner: FetchFn): FetchFn => async (url, init) => {
  const integration = INTEGRATION_PATH.exec(url)?.[1];
  if (integration === undefined) return inner(url, init);

  const fallback = (status: number): Awaited<ReturnType<FetchFn>> => {
    const body = { message: `The ${integration} add-on is not answering right now. The rest of the studio is unaffected.` };
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
    // The proxy's own generic phrase gets the same upgrade as silence — it
    // knows no integration name; this seam does.
    if (said.success && said.data.message !== 'The integration is unreachable.') {
      // Re-serve the consumed body — `json()` reads once.
      return { ok: false, status: reply.status, json: async () => body, text: async () => JSON.stringify(body) };
    }
  } catch {
    // Unparseable is the same case as silent.
  }
  return fallback(reply.status);
};
