import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import type { FeatureEnv, FeatureSeams, Replay } from '../feature';
import { relayed } from './forward';
import type { Forwarder } from './forward';
import { FRAME_GRANT_URL, frameAdmits } from './reach';
import { findIntegration, frameGrantHeld, keepFrameGrant } from './registry';
import type { FrameGrant } from './registry';

// ═══════════════════════════════════════════════════════════════
// THE FRAME SEAM
//
// A host validates every layout against a fixed component vocabulary and
// refuses a bundle naming anything else, which is what stops an untrusted
// integration rendering arbitrary UI. That holds until a vendor's own browser SDK is
// the only way to draw something — a payment onboarding form nobody else may
// collect the fields for. The alternative to this seam is the HOST importing
// that vendor's SDK, which is worse: it makes every app that ever installs
// the integration carry the dependency.
//
// So the integration serves a page and the host frames it, at the host's own origin.
//
// AN IFRAME CARRIES NO AUTHORIZATION HEADER. `src=` is a plain browser GET, so
// the one thing every other surface here relies on is exactly what this path
// cannot have. The screen therefore asks for a GRANT over its own
// authenticated wire, and the iframe spends it.
//
// THE GRANT IS OPAQUE — deliberately NOT a signed assertion. It travels in a
// URL, where things linger: history, logs, a Referer. Anything this
// deployment's key signs is something an integration accepts as identity, so a
// signed grant leaking from a URL bar would be an identity token leaking. A
// random string cannot be replayed as anything; it is redeemed here, and what
// crosses to the integration is a fresh assertion exactly like every other
// call.
//
// IT IS KEPT IN A ROW, BY ITS HASH (./tables.ts, `integration_frame_grants`),
// with what it opens and when it expires. It was a Map in the process that
// minted it, so behind one address with two processes a frame opened by one
// was a 404 on the other, and a restart closed every frame that was open. The
// row holds the hash and never the grant, as the integration key's does: a
// copy of the table opens nothing.
//
// Reusable within its life rather than strictly once — a reload must not
// break the screen somebody is halfway through.
// ═══════════════════════════════════════════════════════════════

// LONG ENOUGH TO FINISH THE FORM. Two minutes was the first guess and it is
// wrong for the thing this exists for: a payment onboarding form asks a
// business for its details, and somebody goes and finds a document. Re-minting
// mid-way is not an option either — the src changing remounts the frame and
// takes the half-filled form with it.
//
// It stays cheap to hold: opaque, single-principal, single-path, redeemable
// only at this origin, and gone when the next grant is minted after its time.
const GRANT_TTL_MS = 30 * 60_000;

// BOUNDED TO ONE SEGMENT BESIDE THE DECLARED PAGE. `embed/onboarding` may call
// `embed/session` and nothing else — no slashes, no dots, no climbing. The
// grant already fixes which integration, which principal and which page; this fixes
// how far a page may reach from where it was let in.
const CALLBACK = /^[a-z0-9][a-z0-9-]*$/;

// What a screen sends to be handed a framed page's address: the page's path,
// as the bundle declared it. Anything else reads as no path.
const FrameBodySchema = z.looseObject({ path: z.string().optional().catch(undefined) }).catch({});

export type FrameDeps = {
  // What the registry's entries are replayed by (./registry.ts): an
  // integration is found by it, and a grant kept and read.
  replay: Replay;
  resolveIdentity: FeatureSeams['resolveIdentity'];
  grantedActionIds: FeatureSeams['grantedActionIds'];
  forward: Forwarder;
};

// What a row keeps of a grant.
const hashOf = (grant: string): string => createHash('sha256').update(grant).digest('hex');

// The grants of this deployment: minted here, kept in the registry, and the
// one a request presents read back from it — of this integration, and not yet
// expired. One answer for expired, unknown, and minted-for-another-integration:
// a grant is a URL somebody may still have, and what it opens is nothing.
const createGrants = (replay: Replay): { mint: (grant: FrameGrant) => Promise<string>; held: (token: string, integration: string) => Promise<FrameGrant | undefined> } => ({
  mint: async (grant) => {
    const now = Date.now();
    const token = randomBytes(24).toString('hex');
    await keepFrameGrant(replay, hashOf(token), grant, new Date(now), new Date(now + GRANT_TTL_MS));
    return token;
  },
  held: (token, integration) => frameGrantHeld(replay, hashOf(token), integration, new Date()),
});

export const frameRoutes = (deps: FrameDeps): Hono<FeatureEnv> => {
  const routes = new Hono<FeatureEnv>();
  const grants = createGrants(deps.replay);

  routes.post(FRAME_GRANT_URL, async (c) => {
    const principal = c.get('principal');
    if (principal === null) return c.json({ message: 'Sign in first.' }, 401);
    const sent: unknown = await c.req.json().catch(() => ({}));
    const path = FrameBodySchema.parse(sent).path ?? '';
    const id = path.split('/')[2] ?? '';
    const found = await findIntegration(deps.replay, id);
    if (found === undefined || found.status !== 'approved') return c.json({ message: 'No such integration.' }, 404);
    const caller = await deps.resolveIdentity(principal);
    if (caller.installed !== undefined && !caller.installed.includes(id)) return c.json({ message: 'Not installed here.' }, 404);
    // THE DECLARATION IS THE PERIMETER HERE TOO. A grant is only ever minted
    // for a page the bundle named at intake, so a screen cannot frame a path
    // the integration never published — including one it serves but did not declare.
    //
    // AND FOR THE SCREEN THAT OWNS IT. This door had the same hole the proxy
    // did, and a worse one to have: `frames` was a bare list of paths with no
    // owner at all, so the only questions askable were "signed in?" and
    // "installed here?". A member of the gym passed both and could be served the
    // page that mounts a payment provider's onboarding form against the
    // studio's merchant account. The bundle names the owning action now, and a
    // grant is minted only for somebody who holds it.
    const held = new Set(deps.grantedActionIds(caller.roles, caller.installed));
    if (!frameAdmits(found.frames, path, held)) return c.json({ message: 'No such frame.' }, 404);

    const token = await grants.mint({ integration: id, principal, path });
    return c.json({ src: `/integrations/${id}/frame/${token}`, expiresIn: GRANT_TTL_MS });
  });

  // Redeeming: a document GET, no session, one token. Registered before the
  // proxy so `/integrations/:id/*` does not match first and demand a principal.
  routes.get('/integrations/:id/frame/:token', async (c) => {
    const id = c.req.param('id');
    const grant = await grants.held(c.req.param('token'), id);
    if (grant === undefined) return c.json({ message: 'Not found.' }, 404);
    // Re-checked at REDEEM, not just at mint: an uninstall between the two is
    // exactly the moment a stale tab must stop working.
    const ended = await deps.forward({
      integration: id,
      principal: grant.principal,
      path: grant.path.split('/').slice(3).join('/'),
      request: (assertion) => ({ headers: { authorization: `Bearer ${assertion}` } }),
    });
    if (ended.kind === 'refused') return c.json({ message: 'Not found.' }, 404);
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    // THE INTEGRATION'S OWN CONTENT TYPE TRAVELS. A framed page is HTML; forcing
    // `application/json` the way the proxy does would hand the browser a
    // document it will not render.
    return relayed(ended.response, 'text/html; charset=utf-8');
  });

  // A FRAMED PAGE CALLING BACK ON ITS OWN GRANT.
  //
  // The page is sandboxed without `allow-same-origin` (the host's Frame
  // component), so it has an opaque origin and no session — it cannot call the
  // proxy, and it has nothing to authenticate with but the grant it was opened
  // by. Without this it is a dead-end document, which is not enough for the
  // thing frames exist for: a vendor's embedded component asks the server for a
  // fresh short-lived session while somebody is mid-form.
  routes.post('/integrations/:id/frame/:token/:call', async (c) => {
    const id = c.req.param('id');
    const call = c.req.param('call');
    if (!CALLBACK.test(call)) return c.json({ message: 'Not found.' }, 404);
    const grant = await grants.held(c.req.param('token'), id);
    if (grant === undefined) return c.json({ message: 'Not found.' }, 404);

    // Beside the page, never above it: the declared frame's own directory.
    const rest = grant.path.split('/').slice(3);
    rest.pop();
    const ended = await deps.forward({
      integration: id,
      principal: grant.principal,
      path: [...rest, call].join('/'),
      request: async (assertion) => ({
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
        body: await c.req.text(),
      }),
    });
    if (ended.kind === 'refused') return c.json({ message: 'Not found.' }, 404);
    if (ended.kind === 'unreachable') return c.json({ message: 'The integration is unreachable.' }, 502);
    // THE CALLER IS AN OPAQUE ORIGIN, and that is deliberate: the framed
    // page is sandboxed WITHOUT `allow-same-origin` so it cannot reach
    // this app's storage or session. The cost is that its `Origin` is
    // literally `null`, and a browser refuses the response without a
    // matching allowance — which is what a vendor's embedded component
    // hits the moment it asks for a fresh session.
    //
    // CORS IS NOT THE FENCE HERE, so opening it costs nothing. The
    // credential is the unguessable, short-lived, single-path grant in the
    // URL; anybody holding it can call this from a server where CORS does
    // not apply at all. Refusing the browser only breaks the one caller
    // this route exists for.
    return relayed(ended.response, 'application/json', { 'access-control-allow-origin': 'null', vary: 'origin' });
  });

  return routes;
};
