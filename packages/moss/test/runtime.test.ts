import { describe, it, expect } from 'vitest';
import { mintDevToken, devSession } from '../src/runtime';

// The dev token pair — the one place token mechanics live. Real auth
// replaces both ends together; this proves the stub round-trips.
describe('runtime — dev token pair', () => {
  it('mints a base64url token whose sub round-trips', () => {
    const token = mintDevToken('usr_001', { name: 'Alex' });
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
    expect(devSession(token)).toBe('usr_001');
  });

  it('a garbage token resolves to null, not a throw', () => {
    expect(devSession('not-a-token')).toBeNull();
    expect(devSession('')).toBeNull();
  });

  it('a token without a string sub is null', () => {
    const noSub = btoa(JSON.stringify({ iat: 1 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(devSession(noSub)).toBeNull();
  });
});
