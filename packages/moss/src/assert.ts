import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════
// THE CREDENTIAL RULE, in one module: the verifier mints, stores at most a
// hash, and the presenter keeps the plaintext. Two credentials fall out of it,
// mirror images of each other:
//
//   IDENTITY ASSERTIONS (outbound — the deployment tells an integration who is
//   calling). The deployment holds a signing keypair; the public half is
//   served openly and verifying is all an integration can do with it. Identity
//   travels INSIDE the signed token — principal, scope, expiry — so a forged
//   header is not "refused", it is meaningless: there is no identity outside a
//   verified envelope. A leaked token impersonates one principal for seconds,
//   not every tenant forever, which is the whole argument against the shared
//   secret this replaced.
//
//   INTEGRATION KEYS (inbound — an integration acts when nobody is driving).
//   Minted by the deployment at registration, shown once, stored only as a
//   hash. Presenting it resolves to a principal the APP names, whose charter
//   rung bounds what it may do. Deleting the integration row kills the key,
//   and with it every assertion story the row anchored — one act, both
//   directions.
//
// Ed25519 because there is nothing to configure: no digest choice, no padding
// mode, no parameter that can be set wrong. The token is two base64url parts —
// JSON payload, then the signature over exactly those payload bytes. That IS
// the wire contract; an integration verifies it with node:crypto in a dozen
// lines and imports nothing of ours to do so.
// ═══════════════════════════════════════════════════════════════

export type Assertion = {
  // Which integration this token is FOR. A service hosting several bundles
  // must check it names the one being called — a token minted for `belts`
  // presented to `stripe` is somebody replaying credentials sideways.
  integration: string;
  principal: string;
  scope: Record<string, unknown>;
  iat: number;
  exp: number;
};

const b64url = (buffer: Buffer): string => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text: string): Buffer => Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export type AssertionSigner = {
  // SPKI DER, base64. Public material — served on the discovery surface,
  // pasted into an environment, cached by anyone. Holding it verifies;
  // nothing about it mints.
  verifyKey: string;
  mint: (claims: { integration: string; principal: string; scope: Record<string, unknown> }, ttlMs?: number) => string;
};

// Generated at boot, held in memory, never persisted — UNLESS a seed is handed
// in. That default is the right one for production: assertions live seconds, so
// a restart invalidating tokens in flight costs one retry, and a key never
// written down is a key nothing can exfiltrate at rest.
//
// THE SEED IS A DEV AFFORDANCE, and it earns its keep. On an in-memory database
// every restart regenerates this keypair, which invalidates the public half an
// integration is holding — so a separate service (the payments integration) starts
// answering "who are you?" to every call until somebody re-copies the new key.
// Seeding the keypair from a fixed value makes the public half STABLE across
// restarts, so the integration's env stays valid. A deployment leaves the seed
// unset and keeps the ephemeral key; a dev sets one and stops re-copying.
//
// The seed is 32 bytes, base64 — an ed25519 private scalar. It never leaves the
// deployment; only the public half is ever served.
const signerFromSeed = (seed: Buffer): { publicKey: KeyObject; privateKey: KeyObject } => {
  // ed25519 private keys are a fixed 32-byte scalar; PKCS8 wraps them in a
  // constant DER prefix, so a deterministic key is that prefix plus the seed.
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed.subarray(0, 32)]);
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  // node derives the public half from a private KeyObject at runtime; the type
  // overloads do not advertise the KeyObject input, hence the cast.
  const asInput = privateKey as unknown as Parameters<typeof createPublicKey>[0];
  return { privateKey, publicKey: createPublicKey(asInput) };
};

export const createAssertionSigner = (seedB64?: string): AssertionSigner => {
  const seed = seedB64 !== undefined && seedB64 !== '' ? Buffer.from(seedB64, 'base64') : undefined;
  const { publicKey, privateKey } =
    seed !== undefined && seed.length >= 32 ? signerFromSeed(seed) : generateKeyPairSync('ed25519');
  const verifyKey = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return {
    verifyKey,
    mint: (claims, ttlMs = 30_000): string => {
      const iat = Date.now();
      const body = Buffer.from(JSON.stringify({ ...claims, iat, exp: iat + ttlMs }));
      return `${b64url(body)}.${b64url(cryptoSign(null, body, privateKey))}`;
    },
  };
};

// The other end of `mint` — exported for checks and for any service written in
// this workspace. A service in its own repository implements these same lines
// against its own runtime's crypto; the contract is the token format, not this
// function.
export const verifyAssertion = (token: string, verifyKey: string, now: number = Date.now()): Assertion | undefined => {
  const dot = token.indexOf('.');
  if (dot <= 0) return undefined;
  try {
    const body = fromB64url(token.slice(0, dot));
    const signature = fromB64url(token.slice(dot + 1));
    const key = createPublicKey({ key: fromB64url(verifyKey), format: 'der', type: 'spki' });
    if (!cryptoVerify(null, body, key, signature)) return undefined;
    const parsed = JSON.parse(body.toString()) as Assertion;
    if (typeof parsed.integration !== 'string' || typeof parsed.principal !== 'string') return undefined;
    if (typeof parsed.exp !== 'number' || parsed.exp <= now) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};

// ── the inbound key ──────────────────────────────────────────
//
// `ik_` + 32 random bytes: the prefix is what lets the identity middleware
// route it without guessing, and the entropy is not a choice anybody gets to
// make. Minted once at registration, returned once, and the row keeps only
// the hash — a lost key is re-registered, not recovered.
export const mintIntegrationKey = (): string => `ik_${randomBytes(32).toString('hex')}`;
export const hashIntegrationKey = (key: string): string => createHash('sha256').update(key).digest('hex');
