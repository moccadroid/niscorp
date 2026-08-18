import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { initSessions, mintSession, sessionOf, revokeSession, revokeAllFor, sessionVerifierOf } from '../src/sessions';
import { mintDevToken } from '../src/runtime';

// THE TESTS NO APP CAN WRITE. An app's harness mints its own tokens, so every
// check it runs passes whether the verifier is real or not — a suite that
// mints cannot fail on a forgery. Only the library knows what a real token
// is, so only the library can hold these: forged refused, tampered refused,
// expired refused, revoked refused on the next call, and a boot with no
// verifier refusing with the sentence instead of serving.

const freshPool = async () => {
  const pool = createPglitePool(new PGlite());
  await initSessions(pool);
  return pool;
};

describe('sessions — the human credential', () => {
  it('mints, verifies, and the token round-trips to its principal', async () => {
    const pool = await freshPool();
    const token = await mintSession(pool, 'i_mara', 60_000);
    expect(token).toMatch(/^st_[A-Za-z0-9_-]{40,}$/);
    expect(await sessionOf(pool, token)).toBe('i_mara');
  });

  it('refuses the 22-character forgery that started this case', async () => {
    const pool = await freshPool();
    await mintSession(pool, 'i_mara', 60_000);
    // btoa('{"sub":"i_mara"}') — a principal anybody can spell.
    expect(await sessionOf(pool, 'eyJzdWIiOiJpX21hcmEifQ')).toBeNull();
  });

  it('refuses a well-formed token that was never minted', async () => {
    const pool = await freshPool();
    expect(await sessionOf(pool, 'st_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
  });

  it('refuses a tampered token — one character off is nobody', async () => {
    const pool = await freshPool();
    const token = await mintSession(pool, 'i_mara', 60_000);
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    expect(await sessionOf(pool, tampered)).toBeNull();
  });

  it('refuses an expired session', async () => {
    const pool = await freshPool();
    const token = await mintSession(pool, 'i_mara', -1000);
    expect(await sessionOf(pool, token)).toBeNull();
  });

  it("revokes one token without touching the principal's other sessions", async () => {
    const pool = await freshPool();
    const here = await mintSession(pool, 'i_mara', 60_000);
    const there = await mintSession(pool, 'i_mara', 60_000);
    await revokeSession(pool, here);
    expect(await sessionOf(pool, here)).toBeNull();
    expect(await sessionOf(pool, there)).toBe('i_mara');
  });

  it('revokeAllFor signs a principal out everywhere, and nobody else', async () => {
    const pool = await freshPool();
    const mara1 = await mintSession(pool, 'i_mara', 60_000);
    const mara2 = await mintSession(pool, 'i_mara', 60_000);
    const kade = await mintSession(pool, 'i_kade', 60_000);
    await revokeAllFor(pool, 'i_mara');
    expect(await sessionOf(pool, mara1)).toBeNull();
    expect(await sessionOf(pool, mara2)).toBeNull();
    expect(await sessionOf(pool, kade)).toBe('i_kade');
  });

  it('stores the hash, never the token', async () => {
    const pool = await freshPool();
    const token = await mintSession(pool, 'i_mara', 60_000);
    const rows = await pool.query('SELECT token_hash FROM sessions');
    expect(rows.rows).toHaveLength(1);
    const stored = String((rows.rows[0] as { token_hash: string }).token_hash);
    expect(stored).not.toBe(token);
    expect(stored).not.toContain(token);
    expect(token).not.toContain(stored);
  });

  it('the broom rides the mint: expired rows are swept by the next one', async () => {
    const pool = await freshPool();
    await mintSession(pool, 'i_mara', -1000);
    await mintSession(pool, 'i_kade', 60_000);
    const rows = await pool.query('SELECT principal FROM sessions');
    expect(rows.rows.map((r) => (r as { principal: string }).principal)).toEqual(['i_kade']);
  });

  it('initSessions is a boot that can run twice', async () => {
    const pool = createPglitePool(new PGlite());
    await initSessions(pool);
    await initSessions(pool);
    const token = await mintSession(pool, 'i_mara', 60_000);
    expect(await sessionOf(pool, token)).toBe('i_mara');
  });
});

describe('sessionVerifierOf — the three-way choice, and the refusal', () => {
  it('an unset verifier refuses with the sentence naming the choices', () => {
    const pool = createPglitePool(new PGlite());
    expect(() => sessionVerifierOf({ pool } as Parameters<typeof sessionVerifierOf>[0])).toThrow(
      /'sessions'.*'dev-open'|dev-open.*sessions/,
    );
  });

  it("'sessions' answers with the stored credential", async () => {
    const pool = await freshPool();
    const verify = sessionVerifierOf({ pool, session: 'sessions' });
    const token = await mintSession(pool, 'i_mara', 60_000);
    expect(await verify(token)).toBe('i_mara');
    expect(await verify('st_forged')).toBeNull();
  });

  it("'dev-open' trusts every token and says so out loud", async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const pool = createPglitePool(new PGlite());
      const verify = sessionVerifierOf({ pool, session: 'dev-open' });
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('every well-formed token is trusted'));
      expect(await verify(mintDevToken('i_anyone'))).toBe('i_anyone');
    } finally {
      spy.mockRestore();
    }
  });

  it('a function passes through untouched', async () => {
    const pool = createPglitePool(new PGlite());
    const verify = sessionVerifierOf({ pool, session: (token) => (token === 'the-one' ? 'i_mara' : null) });
    expect(await verify('the-one')).toBe('i_mara');
    expect(await verify('another')).toBeNull();
  });
});
