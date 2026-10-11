import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createAssertionSigner, verifyAssertion } from '../src/integrations/credentials';

// The keypair a deployment signs assertions with, and the seed that makes it
// the same in every process (../src/integrations/credentials.ts).
const claims = { integration: 'belts', principal: 'i_mara', scope: {} };

describe('createAssertionSigner — the seed', () => {
  it('one seed is one key: what one process signs, another that was given the seed verifies', () => {
    const seed = randomBytes(32).toString('base64');
    const here = createAssertionSigner(seed);
    const there = createAssertionSigner(seed);
    expect(there.verifyKey).toBe(here.verifyKey);
    expect(verifyAssertion(here.mint(claims), there.verifyKey)?.principal).toBe('i_mara');
  });

  it('no seed is a key made here and kept nowhere: two signers, two keys', () => {
    expect(createAssertionSigner().verifyKey).not.toBe(createAssertionSigner().verifyKey);
    // An empty string is no seed: what an environment variable that is not set
    // reads as, once an app has written `?? ''` after it.
    expect(createAssertionSigner('').verifyKey).not.toBe(createAssertionSigner('').verifyKey);
  });

  // A seed that decodes to fewer than 32 bytes is refused, not replaced by a
  // random key: two processes given the same seed would sign with different
  // keys, and each would refuse what the other signed.
  it.each([
    ['a word', 'consent-check-seed', 13],
    ['sixteen bytes', randomBytes(16).toString('base64'), 16],
    ['one byte short', randomBytes(31).toString('base64'), 31],
    ['nothing base64 reads', '!!!', 0],
  ])('a seed that cannot be a key refuses when the signer is made: %s', (_what, seed, bytes) => {
    const made = ((): string => {
      try {
        createAssertionSigner(seed);
        return 'a signer was made';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();
    // what was given, by its length, and what is needed
    expect(made).toContain(`decodes to ${bytes} byte`);
    expect(made).toContain('32');
    // never the seed
    expect(made).not.toContain(seed);
  });

  it('a seed longer than a key is its first 32 bytes, as it always was', () => {
    const bytes = randomBytes(48);
    expect(createAssertionSigner(bytes.toString('base64')).verifyKey).toBe(createAssertionSigner(bytes.subarray(0, 32).toString('base64')).verifyKey);
  });
});

// WHAT THE OTHER END DOES WITH AN ASSERTION. `verifyAssertion` is no part of
// what moss exports: an integration's service verifies for itself. It stands
// in for that service in the tests which ask "can the other end verify what
// this deployment signed"; an oracle that passed a forged or an expired
// assertion would make every one of them pass on anything.
describe('verifyAssertion — what an integration’s service accepts as identity', () => {
  const b64url = (text: string): string => Buffer.from(text).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  it('what this deployment signed, read back as it was said', () => {
    const signer = createAssertionSigner();
    const read = verifyAssertion(signer.mint({ ...claims, scope: { studioId: 's_1' } }), signer.verifyKey);
    expect(read).toMatchObject({ integration: 'belts', principal: 'i_mara', scope: { studioId: 's_1' } });
  });

  it('a body that was altered after it was signed, and one signed by another key, are nobody', () => {
    const signer = createAssertionSigner();
    const [body, signature] = signer.mint(claims).split('.');
    const now = Date.now();
    // The same signature under a body that names somebody else.
    const altered = `${b64url(JSON.stringify({ ...claims, principal: 'i_owner', iat: now, exp: now + 30_000 }))}.${signature}`;
    expect(verifyAssertion(altered, signer.verifyKey)).toBeUndefined();
    expect(verifyAssertion(`${body}.${signature}`, createAssertionSigner().verifyKey)).toBeUndefined();
    expect(verifyAssertion(createAssertionSigner().mint(claims), signer.verifyKey)).toBeUndefined();
    // With no signature, or none that is one.
    expect(verifyAssertion(String(body), signer.verifyKey)).toBeUndefined();
    expect(verifyAssertion(`${body}.`, signer.verifyKey)).toBeUndefined();
  });

  it('is good until the instant it says, and nobody from then on', () => {
    const signer = createAssertionSigner();
    const minted = Date.now();
    const token = signer.mint(claims, 30_000);
    const expires = verifyAssertion(token, signer.verifyKey, minted)?.exp ?? 0;
    expect(expires - minted).toBeGreaterThanOrEqual(30_000);
    expect(verifyAssertion(token, signer.verifyKey, expires - 1)?.principal).toBe('i_mara');
    expect(verifyAssertion(token, signer.verifyKey, expires)).toBeUndefined();
    expect(verifyAssertion(token, signer.verifyKey, expires + 60_000)).toBeUndefined();
  });
});
