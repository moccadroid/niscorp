import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import type { CredentialAnswer, FeatureSeams } from '../feature';

const AssertionSchema = z.looseObject({
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
  // SPKI DER, as base64.
  verifyKey: string;
  mint: (claims: { integration: string; principal: string; scope: Record<string, unknown> }, ttlMs?: number) => string;
};

const SEED_BYTES = 32;

const seedRefusal = (bytes: number): Error =>
  new Error(
    `moss: the signing seed decodes to ${bytes} ${bytes === 1 ? 'byte' : 'bytes'}, and a signing key is ${SEED_BYTES}. ` +
      `Give ${SEED_BYTES} random bytes as base64 (\`signingSeed\` of \`createIntegrations\`), or give none: with no seed a key is made when the server starts and kept nowhere.`,
  );

const signerFromSeed = (seed: Buffer): { publicKey: KeyObject; privateKey: KeyObject } => {
  // PKCS8 wraps an ed25519 private key, a 32-byte scalar, in a constant DER prefix.
  const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed.subarray(0, SEED_BYTES)]);
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  // Exported to PEM because that is a form createPublicKey is typed to take.
  return { privateKey, publicKey: createPublicKey(privateKey.export({ type: 'pkcs8', format: 'pem' })) };
};

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

export const mintIntegrationKey = (): string => `ik_${randomBytes(32).toString('hex')}`;
export const hashIntegrationKey = (key: string): string => createHash('sha256').update(key).digest('hex');

export const KEY_PREFIX = 'ik_';

export type IntegrationActor = (integration: string, actsFor: string) => string | null | Promise<string | null>;

const NO_ACTOR: CredentialAnswer = { refused: { status: 403, error: 'no_actor', message: 'This integration has no actor there.' } };

export const keyCredential =
  (deps: {
    byKey: (key: string) => Promise<string | undefined>;
    actor: IntegrationActor | undefined;
    resolveIdentity: FeatureSeams['resolveIdentity'];
  }) =>
  async (token: string, request: Request): Promise<CredentialAnswer> => {
    const integration = await deps.byKey(token);
    if (integration === undefined) return { refused: { status: 401, error: 'invalid_key', message: 'The integration key did not resolve.' } };
    const actor = (await deps.actor?.(integration, request.headers.get('x-nisc-acts-for') ?? '')) ?? null;
    if (actor === null) return NO_ACTOR;
    // The app may name an actor without asking whether it is live: one that identity resolves to
    // nobody (the public role alone) is refused.
    const resolved = await deps.resolveIdentity(actor);
    if (resolved.roles.length === 1 && resolved.roles[0] === 'public') return NO_ACTOR;
    return { principal: actor };
  };
