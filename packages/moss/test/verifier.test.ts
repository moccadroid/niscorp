import { describe, it, expect, vi } from 'vitest';
import type { PgPool } from '@niscorp/vex';
import * as moss from '../src/index';
import { sessionRevokerOf, sessionVerifierOf } from '../src/identity/verifier';

// WHO A TOKEN IS, AND WHAT THE BOOT SAYS ABOUT IT. A deployment's door is one
// of three, and the two moss cannot vouch for are said out loud when the
// server starts: the dev stub, and a function of the app's own. Nothing here
// touches a database: a verifier that is not 'sessions' never asks one.

const noDatabase: PgPool = { query: async () => ({ rows: [] }) };

describe('the dev verifier is not something an app is handed', () => {
  it('the main entry mints a dev token and does not export the verifier that trusts one', () => {
    expect(Object.keys(moss)).toContain('mintDevToken');
    expect(Object.keys(moss)).not.toContain('devSession');
  });

  it("…and `session: 'dev-open'` is still how a deployment gets it, with its line at boot", async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const verify = sessionVerifierOf({ pool: noDatabase, session: 'dev-open' });
      expect(said).toHaveBeenCalledWith(expect.stringContaining('every well-formed token is trusted'));
      expect(await verify(moss.mintDevToken('i_anyone'))).toBe('i_anyone');
    } finally {
      said.mockRestore();
    }
  });
});

describe('a verifier passed as a function is named at boot', () => {
  it('in one line, with the name it goes by', async () => {
    const said = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const verifyWithOurProvider = (token: string): string | null => (token === 'the-one' ? 'i_mara' : null);
      const verify = sessionVerifierOf({ pool: noDatabase, session: verifyWithOurProvider });
      expect(said).toHaveBeenCalledTimes(1);
      expect(said).toHaveBeenCalledWith(expect.stringMatching(/^\[moss\] session: .*function.*verifyWithOurProvider/));
      // and it is still the app's function that answers, untouched
      expect(await verify('the-one')).toBe('i_mara');
      expect(await verify('another')).toBeNull();
    } finally {
      said.mockRestore();
    }
  });

  it('a function with no name is still said to be one', () => {
    const said = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      sessionVerifierOf({ pool: noDatabase, session: (() => (token: string): string | null => token)() });
      expect(said).toHaveBeenCalledTimes(1);
      expect(said).toHaveBeenCalledWith(expect.stringMatching(/^\[moss\] session: .*function/));
    } finally {
      said.mockRestore();
    }
  });

  it("moss's own credential says nothing: there is nothing to take on trust", () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      sessionVerifierOf({ pool: noDatabase, session: 'sessions' });
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      error.mockRestore();
    }
  });
});

// HOW A SIGN-OUT FORGETS A PRINCIPAL'S SESSIONS: the twin of the choice above,
// asked by the server once and handed to the shell host.
describe('sessionRevokerOf — who forgets every session a principal holds', () => {
  it("under moss's own credential it deletes them, on the pool, for that principal", async () => {
    const asked: { sql: string; params: readonly unknown[] }[] = [];
    const pool: PgPool = { query: async (sql, params) => (asked.push({ sql, params: params ?? [] }), { rows: [] }) };
    const revoke = sessionRevokerOf({ pool, session: 'sessions' });
    await revoke?.('i_mara');
    expect(asked).toHaveLength(1);
    expect(asked[0]?.sql).toMatch(/^DELETE FROM/);
    expect(asked[0]?.params).toEqual(['i_mara']);
  });

  it("a verifier of the app's own, and the dev one, keep nothing moss could forget", () => {
    expect(sessionRevokerOf({ pool: noDatabase, session: 'dev-open' })).toBeUndefined();
    expect(sessionRevokerOf({ pool: noDatabase, session: () => 'i_anyone' })).toBeUndefined();
  });
});
