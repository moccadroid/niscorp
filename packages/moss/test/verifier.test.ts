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

// MOSS'S STORED SESSIONS ARE WHAT `session: 'sessions'` VERIFIES WITH, and the
// two calls an app makes on them are for a deployment in that mode: it is the
// one whose database has the table (`createServer` and `migrateTables` make
// it there, and nowhere else). Called on any other database, they failed with
// the driver's sentence about a relation, which says nothing of the choice
// that was made on the runtime.
describe('mintSession and revokeAllFor, on a database that keeps no stored sessions', () => {
  // What Postgres answers for a table that is not there, as `pg` and PGlite
  // both hand it over: an error with the code of an undefined table.
  const noSuchTable = (): Error => Object.assign(new Error('relation "sessions" does not exist'), { code: '42P01' });
  const without: PgPool = { query: async () => Promise.reject(noSuchTable()) };
  // The whole message: `toThrowError` with an Error compares the two messages.
  const sentence = (call: string): Error =>
    new Error(
      `moss: ${call} was called on a database that has no \`sessions\` table. Moss's stored sessions are what \`session: 'sessions'\` verifies with: ` +
        'with that on the runtime, createServer and migrateTables make the table, and mintSession and revokeAllFor are for that deployment. ' +
        'An app whose `session` is a verifier of its own keeps its own credential, and mints and revokes it itself.',
    );

  it('mintSession says which choice it belongs to', async () => {
    await expect(moss.mintSession(without, 'i_mara', 60_000)).rejects.toThrowError(sentence('mintSession'));
  });

  it('revokeAllFor says the same', async () => {
    await expect(moss.revokeAllFor(without, 'i_mara')).rejects.toThrowError(sentence('revokeAllFor'));
  });

  it('what the database throws for any other reason is thrown as it is', async () => {
    const down: PgPool = { query: async () => Promise.reject(Object.assign(new Error('the connection was refused'), { code: 'ECONNREFUSED' })) };
    await expect(moss.mintSession(down, 'i_mara', 60_000)).rejects.toThrow(/^the connection was refused$/);
    await expect(moss.revokeAllFor(down, 'i_mara')).rejects.toThrow(/^the connection was refused$/);
  });
});
