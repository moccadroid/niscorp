import { Hono } from 'hono';
import type { FeatureEnv, FeatureSeams } from '../feature';
import { relayed } from './forward';
import type { Forwarder } from './forward';
import { reachAdmits } from './reach';

// ═══════════════════════════════════════════════════════════════
// THE WEBHOOK DOOR, AND THE PROXY — everything under `/integrations/<id>/`
// that is not a frame: a vendor calling in, and a screen calling out.
//
// The webhook is mounted first, because the proxy's `/integrations/:id/*`
// would otherwise match first and demand a principal. (The frame routes are
// mounted before both, for the same reason: ./frame.ts.)
// ═══════════════════════════════════════════════════════════════

// A DOOR WE DID NOT LOCK NEEDS A LIMIT. Every other surface is bounded by a
// credential; the webhook is bounded by the vendor behaving. In-process and per
// integration, so a deployment on two machines gets two ceilings — the honest
// cost of not putting a shared store behind this yet.
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
  holds: FeatureSeams['holds'];
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
// is: an integration reading `studio_id` from the body has reintroduced the
// hole whatever we sign.
const proxy = (deps: ProxyDeps, routes: Hono<FeatureEnv>): void => {
  routes.all('/integrations/:id/*', async (c) => {
    const principal = c.get('principal');
    if (principal === null) return c.json({ message: 'Sign in first.' }, 401);
    const id = c.req.param('id');
    // The QUERY TRAVELS. `c.req.path` drops it, so an endpoint declared with
    // `?view=summary` arrived at the integration without it — the integration answered a
    // different question than the screen asked, and nothing said so.
    const here = new URL(c.req.url);
    const ended = await deps.forward({
      integration: id,
      principal,
      // THE DECLARATION IS THE PERIMETER (./reach.ts). Before this,
      // being signed in at a studio that installed an integration was permission to call
      // ANY path the integration's service happened to serve — its internals, its
      // admin verbs, whatever it grew next release. Now it is permission to call
      // the paths the integration declared, and nothing is forwarded for the rest.
      //
      // AND ONLY THE ONES THIS CALLER'S OWN SCREENS DECLARE. The path check alone
      // was half the fence: reach is the union over every action in the bundle, so
      // a member at a studio with payments installed reached the merchant
      // onboarding endpoint — the charter's `ext.desk.*` fence decided which
      // SCREENS rendered and nothing about which endpoints answered. The catalog
      // is the same one the shell is built from, so a door and the screen that
      // opens it can no longer disagree.
      //
      // Checked BEFORE the assertion is minted: an inadmissible path gets no
      // credential, not even one that would have died at the other end.
      admits: (found, caller) => reachAdmits(found.reach, c.req.path, new Set(deps.holds(caller.roles, caller.installed))),
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
