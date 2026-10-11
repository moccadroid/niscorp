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

  // A seed that decoded to fewer than 32 bytes was dropped without a word and
  // a random key was made in its place: two processes given the same seed
  // signed with different keys, and each refused what the other had signed.
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
