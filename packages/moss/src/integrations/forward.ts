import type { AssertionSigner } from './credentials';
import type { FoundIntegration } from './registry';

// ═══════════════════════════════════════════════════════════════
// ONE WAY OUT. Five doors reach an integration's own service: a framed page
// being opened, that page calling back, a vendor's webhook, a screen's call
// through the proxy, and the deployment's own call when nobody is driving.
// Each wrote the same steps out for itself, in the same order:
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

// Who a call is made for, as far as a door needs to know: the roles a reach is
// decided by, and the integrations live for their tenant (`undefined`: the app
// keeps no install list, and every integration is live).
export type Caller = { roles: readonly string[]; installed: readonly string[] | undefined };

export type ForwardDeps = {
  find: (id: string) => Promise<FoundIntegration | undefined>;
  who: (principal: string) => Promise<Caller>;
  // The scope values a principal carries: the ones the engine pins rows by.
  scopeOf: (principal: string) => Promise<Record<string, unknown>>;
  mint: AssertionSigner['mint'];
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
  admits?: (found: FoundIntegration, caller: Caller) => boolean;
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
  // It was sent and no answer came back.
  | { kind: 'unreachable'; error: unknown };

export type Forwarder = (call: Forward) => Promise<Forwarded>;

export const createForwarder = (deps: ForwardDeps): Forwarder => {
  const send = deps.fetch ?? fetch;
  // The request is built inside the same guard as the fetch: a body that
  // cannot be read is a call that did not go out.
  const sent = async (url: string, request: () => RequestInit | Promise<RequestInit>): Promise<Forwarded> => {
    try {
      return { kind: 'answered', response: await send(url, await request()) };
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
    const caller = await deps.who(principal);
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
