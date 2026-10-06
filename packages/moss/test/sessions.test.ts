import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createPglitePool } from '@niscorp/vex/pglite';
import { initSessions, mintSession, sessionOf, sessionRemainingMs, revokeSession, revokeAllFor, sessionVerifierOf } from '../src/sessions';
import { mintDevToken } from '../src/runtime';
import { createShellHost } from '../src/shells';
import type { ShellHostContext } from '../src/shells';
import type { FunctionSession, NiscApp } from '../src/app';
import type { PgPool, ScopePolicy } from '@niscorp/vex';

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
    // …and for how much longer: what a browser is told to keep its cookie for
    const remaining = (await sessionRemainingMs(pool, token)) ?? 0;
    expect(remaining).toBeGreaterThan(50_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
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
    expect(await sessionRemainingMs(pool, token)).toBeNull();
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

// ═══════════════════════════════════════════════════════════════
// SIGN-OUT IS A REVOCATION. `session.revoke()` closes every terminal of the
// shell and disposes it — and under moss's own credential it must also delete
// what those terminals held, or a copied token signs straight back in until
// it expires. The shell is per principal and sign-out closes all of its
// terminals, so every session the principal holds goes with it.
// ═══════════════════════════════════════════════════════════════

describe('sign-out — session.revoke() under moss sessions', () => {
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  const hostOver = (pool: PgPool, session: 'sessions' | 'dev-open', seen: { fn?: FunctionSession }): ReturnType<typeof createShellHost> => {
    const policy: ScopePolicy = { default: 'deny', entities: {} };
    const catalog = { ids: ['counter'], hash: 'h' };
    const app = {
      charter: { public: ['counter'] },
      actions: { counter: { id: 'counter', data: { n: 0 } } },
      shell: { canvases: [{ id: 'main', initial: 'counter' }] },
      functions: (fn: FunctionSession) => {
        seen.fn = fn;
        return {};
      },
    } as unknown as NiscApp;
    const ctx: ShellHostContext = {
      app,
      catalogFor: () => catalog,
      variantsFor: () => new Map(),
      resolve: async () => ({ roles: ['member'], scope: {}, installed: undefined, catalog, variants: new Map(), policy }),
      wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
      runtime: { pool, session } as unknown as ShellHostContext['runtime'],
    };
    return createShellHost(ctx);
  };

  it('deletes every session the principal holds — a copied token no longer signs in', async () => {
    const pool = await freshPool();
    const phone = await mintSession(pool, 'i_mara', 60_000);
    const laptop = await mintSession(pool, 'i_mara', 60_000);
    const kade = await mintSession(pool, 'i_kade', 60_000);
    const seen: { fn?: FunctionSession } = {};
    await hostOver(pool, 'sessions', seen).session(phone, 'i_mara');
    await tick();

    await seen.fn?.revoke();

    expect(await sessionOf(pool, phone)).toBeNull();
    expect(await sessionOf(pool, laptop)).toBeNull();
    expect(await sessionOf(pool, kade)).toBe('i_kade');
  });

  it('under dev-open there is no stored credential, and nothing is touched', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const pool = await freshPool();
      const kept = await mintSession(pool, 'i_mara', 60_000);
      const seen: { fn?: FunctionSession } = {};
      await hostOver(pool, 'dev-open', seen).session(kept, 'i_mara');
      await tick();
      await seen.fn?.revoke();
      expect(await sessionOf(pool, kept)).toBe('i_mara');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('onSession — a microtask is enough to reach the shell', () => {
  // The documented contract: `onSession` runs before the shell exists, so it
  // defers. A microtask is the deferral an observer needs — anything later
  // subscribes after the shell's mount calls have answered. An await between
  // the seam and the shell (the phrases, once) makes that microtask land
  // mid-build, where the getter throws.
  it('holds when the app resolves phrases asynchronously', async () => {
    const policy: ScopePolicy = { default: 'deny', entities: {} };
    const catalog = { ids: ['counter'], hash: 'h' };
    const reached: boolean[] = [];
    const app = {
      charter: { public: ['counter'] },
      actions: { counter: { id: 'counter', data: { n: 0 } } },
      shell: { canvases: [{ id: 'main', initial: 'counter' }] },
      phrases: async () => {
        await new Promise((r) => setTimeout(r, 0));
        return {};
      },
      onSession: (session: FunctionSession) => {
        queueMicrotask(() => {
          try {
            reached.push(session.shell.id !== '');
          } catch {
            reached.push(false);
          }
        });
      },
    } as unknown as NiscApp;
    const ctx: ShellHostContext = {
      app,
      catalogFor: () => catalog,
      variantsFor: () => new Map(),
      resolve: async () => ({ roles: ['member'], scope: {}, installed: undefined, catalog, variants: new Map(), policy }),
      wire: () => async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
      runtime: { pool: await freshPool(), session: 'dev-open' } as unknown as ShellHostContext['runtime'],
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await createShellHost(ctx).session(mintDevToken('i_mara'), 'i_mara');
    } finally {
      spy.mockRestore();
    }
    expect(reached).toEqual([true]);
  });
});
