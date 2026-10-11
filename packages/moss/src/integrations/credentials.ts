import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import type { CredentialAnswer, FeatureSeams } from '../feature';

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

// WHAT A TOKEN CARRIES, read by a schema where a token is verified: the bytes
// came over a wire, and the signature says who wrote them, not what they hold.
// A claim this does not name is left on the payload.
const AssertionSchema = z.looseObject({
  // Which integration this token is FOR. A service hosting several bundles
  // must check it names the one being called — a token minted for `belts`
  // presented to `stripe` is somebody replaying credentials sideways.
  integration: z.string(),
  principal: z.string(),
  scope: z.record(z.string(), z.unknown()),
  iat: z.number(),
  exp: z.number(),
});

export type Assertion = z.infer<typeof AssertionSchema>;

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
const SEED_BYTES = 32;

// A SEED THAT IS GIVEN AND CANNOT BE A KEY REFUSES, when the signer is made.
// One that decoded to fewer than 32 bytes used to be dropped without a word
// and a random key made in its place: two processes given the same seed signed
// with different keys, each refused what the other had signed, and nothing
// said why. The sentence says what was given by its length. Never the seed.
const seedRefusal = (bytes: number): Error =>
  new Error(
    `moss: the signing seed decodes to ${bytes} ${bytes === 1 ? 'byte' : 'bytes'}, and a signing key is ${SEED_BYTES}. ` +
      `Give ${SEED_BYTES} random bytes as base64 (\`signingSeed\` of \`createIntegrations\`), or give none: with no seed a key is made when the server starts and kept nowhere.`,
  );

const signerFromSeed = (seed: Buffer): { publicKey: KeyObject; privateKey: KeyObject } => {
  // ed25519 private keys are a fixed 32-byte scalar; PKCS8 wraps them in a
  // constant DER prefix, so a deterministic key is that prefix plus the seed.
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed.subarray(0, SEED_BYTES)]);
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  // node derives the public half from a private key it is handed. It is handed
  // the key as PEM because that is a form `createPublicKey` is typed to take;
  // the key it answers is the same one.
  return { privateKey, publicKey: createPublicKey(privateKey.export({ type: 'pkcs8', format: 'pem' })) };
};

// `seedB64` absent, or the empty string an unset environment variable reads
// as: no seed, and a key is generated. Anything else is a seed, and is used
// or refused. One longer than a key is its first 32 bytes.
export const createAssertionSigner = (seedB64?: string): AssertionSigner => {
  const seed = seedB64 !== undefined && seedB64 !== '' ? Buffer.from(seedB64, 'base64') : undefined;
  if (seed !== undefined && seed.length < SEED_BYTES) throw seedRefusal(seed.length);
  const { publicKey, privateKey } = seed !== undefined ? signerFromSeed(seed) : generateKeyPairSync('ed25519');
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

// The other end of `mint`, for moss's own tests: the package does not export
// it. An integration's service implements these same lines against its own
// runtime's crypto; the contract is the token format, not this function.
export const verifyAssertion = (token: string, verifyKey: string, now: number = Date.now()): Assertion | undefined => {
  const dot = token.indexOf('.');
  if (dot <= 0) return undefined;
  try {
    const body = fromB64url(token.slice(0, dot));
    const signature = fromB64url(token.slice(dot + 1));
    const key = createPublicKey({ key: fromB64url(verifyKey), format: 'der', type: 'spki' });
    if (!cryptoVerify(null, body, key, signature)) return undefined;
    const payload: unknown = JSON.parse(body.toString());
    const parsed = AssertionSchema.safeParse(payload);
    if (!parsed.success || parsed.data.exp <= now) return undefined;
    return parsed.data;
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

// ═══════════════════════════════════════════════════════════════
// WHO AN INTEGRATION IS when it acts and nobody is driving.
//
// A webhook lands, a nightly sync runs: the integration presents the key it
// was issued and names who it acts for (`x-nisc-acts-for` — a tenant in most
// apps, and opaque here for the same reason scope values are). The key
// resolves through the registry (hash match, approved only) to a principal
// the APP names — and from that line on nothing downstream can tell it from a
// person: same policy compilation, same scope values, same engine stamping its
// writes. Deleting the integration is what revokes it; there is no second
// mechanism to forget.
// ═══════════════════════════════════════════════════════════════

// The prefix every key is minted with (`mintIntegrationKey` above): what lets the
// server's authentication hand a token here without guessing.
export const KEY_PREFIX = 'ik_';

// The app's answer to "which principal is this integration, acting for that":
// `integrationActor` in the feature's configuration (./feature.ts).
export type IntegrationActor = (integration: string, actsFor: string) => string | null | Promise<string | null>;

const NO_ACTOR: CredentialAnswer = { refused: { status: 403, error: 'no_actor', message: 'This integration has no actor there.' } };

export const keyCredential =
  (deps: {
    // The approved integration a presented key belongs to (./registry.ts).
    byKey: (key: string) => Promise<string | undefined>;
    actor: IntegrationActor | undefined;
    resolveIdentity: FeatureSeams['resolveIdentity'];
  }) =>
  async (token: string, request: Request): Promise<CredentialAnswer> => {
    const integration = await deps.byKey(token);
    if (integration === undefined) return { refused: { status: 401, error: 'invalid_key', message: 'The integration key did not resolve.' } };
    const actor = (await deps.actor?.(integration, request.headers.get('x-nisc-acts-for') ?? '')) ?? null;
    if (actor === null) return NO_ACTOR;
    // The app's answer may be PURE (composing the actor id from its parts) —
    // whether the install is live is identity's question, so an actor that
    // resolves to nobody is refused here, where null used to be.
    const resolved = await deps.resolveIdentity(actor);
    if (resolved.roles.length === 1 && resolved.roles[0] === 'public') return NO_ACTOR;
    return { principal: actor };
  };
