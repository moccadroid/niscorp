import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

// ── WHO IS CALLING — and there is only one way to answer ─────
//
// The token is two base64url parts: a JSON payload, then an ed25519 signature
// over exactly those payload bytes, made by the deployment whose public key
// sits in this service's environment. That is the whole wire contract, and
// these lines are deliberately NOT imported from Lyra's workspace: an
// integration in its own repository writes them against its own runtime's
// crypto, and the contract is the token format, not anybody's function.
//
// Identity is READABLE ONLY THROUGH THIS. There is no header fallback and no
// second path — a route that wants to know who is calling has to verify, so
// forgetting a guard cannot open anything: an unverified request has no
// identity to scope by. On the webhook door, where the host mints no assertion
// at all, this returns nothing — which is why a hook router is handed no
// identity function to call in the first place (integration.ts).
//
// READ PER REQUEST, not at import: an operator pastes the value and restarts,
// and a check sets it after boot without restarting a process it holds.
const verifyKey = (): string => process.env['LYRA_VERIFY_KEY'] ?? '';

// `personId` is set only for callers the studio KNOWS (lyra's anchor row) —
// staff-only principals arrive with it empty, which is what an integration's "only
// somebody the studio knows can pay" check keys on.
export type Identity = { principal: string; studioId: string; personId: string; country: string };

const fromB64url = (text: string): Buffer => Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export const readIdentity = (
  c: { req: { header: (name: string) => string | undefined } },
  integration: string,
): Identity | undefined => {
  const keyB64 = verifyKey();
  if (keyB64 === '') return undefined;
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
  const dot = token.indexOf('.');
  if (dot <= 0) return undefined;
  try {
    const body = fromB64url(token.slice(0, dot));
    const signature = fromB64url(token.slice(dot + 1));
    const key = createPublicKey({ key: fromB64url(keyB64), format: 'der', type: 'spki' });
    if (!cryptoVerify(null, body, key, signature)) return undefined;
    const parsed = JSON.parse(body.toString()) as { integration?: unknown; principal?: unknown; scope?: Record<string, unknown>; exp?: unknown };
    // Expired is invalid — a token lives seconds, and one that leaked into a
    // log is not a credential a minute later.
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return undefined;
    // FOR US, not just BY them. A token minted for another integration on the
    // same deployment is somebody replaying credentials sideways — and with
    // several integrations in one process, this is the line that keeps them apart.
    if (parsed.integration !== integration || typeof parsed.principal !== 'string') return undefined;
    const scope = parsed.scope ?? {};
    return {
      principal: parsed.principal,
      studioId: String(scope['studioId'] ?? ''),
      personId: String(scope['personId'] ?? ''),
      // Where the studio trades. It arrives in the envelope like everything else
      // about who is calling, so an integration never has to ask and a caller can never
      // say — which matters here because it decides what a payment provider
      // asks a business for.
      country: String(scope['country'] ?? ''),
    };
  } catch {
    return undefined;
  }
};
