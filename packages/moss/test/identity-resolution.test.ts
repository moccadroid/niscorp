import { describe, it, expect } from 'vitest';
import { createIdentity } from '../src/identity';
import type { IdentityRecord } from '../src/identity';
import type { IdentityConfig } from '../src/identity/resolution';

const noRows: IdentityConfig['readAs'] = async () => undefined;

describe('who a principal is', () => {
  it('asks the identity seam once for a session, and carries what it answered', async () => {
    let asked = 0;
    const identity = createIdentity({
      seam: {
        resolve: async (principal) => {
          asked += 1;
          return { roles: ['member'], scope: { studioId: `st_${principal}` }, installed: ['mail'] };
        },
      },
      readAs: noRows,
      idleMs: 0,
    });

    const first = await identity.resolve('p_ava');
    const second = await identity.resolve('p_ava');
    expect(asked).toBe(1);
    expect(first.roles).toEqual(['member']);
    expect(first.scope).toEqual({ studioId: 'st_p_ava' });
    expect(first.installed).toEqual(['mail']);
    expect(second.key).toBe(first.key);
    identity.stop();
  });

  it("lends the seam a read that runs as the role `as` names, under the scope the app passes", async () => {
    const reads: unknown[] = [];
    const identity = createIdentity({
      seam: {
        as: 'identity',
        resolve: async (principal, read) => {
          const row = await read('identity/member', { userId: principal });
          return { roles: [String(row)], scope: {} };
        },
      },
      readAs: async (role, fingerprint, scope) => {
        reads.push({ role, fingerprint, scope });
        return 'member';
      },
      idleMs: 0,
    });

    expect((await identity.resolve('p_ava')).roles).toEqual(['member']);
    expect(reads).toEqual([{ role: 'identity', fingerprint: 'identity/member', scope: { userId: 'p_ava' } }]);
    identity.stop();
  });

  it('refuses a read from a seam that names no role to read as', async () => {
    const identity = createIdentity({
      seam: { resolve: async (_principal, read) => ({ roles: [String(await read('identity/member', {}))], scope: {} }) },
      readAs: noRows,
      idleMs: 0,
    });
    await expect(identity.resolve('p_ava')).rejects.toThrow(/identity\.as/);
    identity.stop();
  });

  it('nobody signed in is public, and the seam is not asked', async () => {
    let asked = 0;
    const identity = createIdentity({
      seam: { resolve: async () => ((asked += 1), { roles: ['member'], scope: {} }) },
      readAs: noRows,
      idleMs: 0,
    });
    const nobody = await identity.resolve(null);
    expect(nobody.roles).toEqual(['public']);
    expect(nobody.installed).toBeUndefined();
    expect(asked).toBe(0);
    identity.stop();
  });

  it('with no seam the assignments answer, and anybody they do not name is public', async () => {
    const identity = createIdentity({ assignments: { usr_1: ['sales'] }, readAs: noRows });
    expect((await identity.resolve('usr_1')).roles).toEqual(['sales']);
    expect((await identity.resolve('stranger')).roles).toEqual(['public']);
    expect((await identity.resolve(null)).roles).toEqual(['public']);
    expect(identity.invalidate('usr_1')).toBe(false);
    expect(identity.invalidateTag('st_a')).toEqual([]);
    expect(identity.roster).toBeUndefined();
  });

  it('two people on the same roles with the same installs share a key; a different install set does not', async () => {
    const records: Record<string, IdentityRecord> = {
      a: { roles: ['member', 'instructor'], scope: {}, installed: ['mail'] },
      b: { roles: ['instructor', 'member'], scope: {}, installed: ['mail'] },
      c: { roles: ['member', 'instructor'], scope: {}, installed: [] },
      d: { roles: ['member', 'instructor'], scope: {} },
    };
    const identity = createIdentity({ seam: { resolve: async (principal) => records[principal] ?? { roles: ['public'], scope: {} } }, readAs: noRows, idleMs: 0 });
    const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map((principal) => identity.resolve(principal)));
    expect(a?.key).toBe(b?.key);
    expect(c?.key).not.toBe(a?.key);
    expect(d?.key).not.toBe(c?.key);
    identity.stop();
  });
});

describe('the scope values a principal carries', () => {
  it('are the principal, then what the record says, then what the scope hook computes from it', async () => {
    const identity = createIdentity({
      seam: { resolve: async () => ({ roles: ['member'], scope: { studioId: 'st_a', today: 'stale' } }) },
      scope: (_principal, record) => ({ today: `today in ${String(record?.scope['studioId'])}` }),
      readAs: noRows,
      idleMs: 0,
    });
    const resolved = await identity.resolve('p_ava');
    const expected = { userId: 'p_ava', studioId: 'st_a', today: 'today in st_a' };
    expect(identity.composeScope('p_ava', resolved)).toEqual(expected);
    expect(await identity.scopeValuesFor('p_ava')).toEqual(expected);
    identity.stop();
  });

  it('name nobody as anonymous, and hand the hook no record when there is no seam', async () => {
    const seen: unknown[] = [];
    const identity = createIdentity({
      scope: (principal, record) => {
        seen.push([principal, record]);
        return { propertyId: 'pr_1' };
      },
      readAs: noRows,
    });
    expect(await identity.scopeValuesFor(null)).toEqual({ userId: 'anonymous', propertyId: 'pr_1' });
    expect(await identity.scopeValuesFor('usr_1')).toEqual({ userId: 'usr_1', propertyId: 'pr_1' });
    expect(seen).toEqual([
      [null, undefined],
      ['usr_1', undefined],
    ]);
  });
});

describe('forgetting', () => {
  it('one principal, a tag, or everybody: the next ask goes back to the seam', async () => {
    let asked = 0;
    const identity = createIdentity({
      seam: { resolve: async (principal) => ((asked += 1), { roles: ['member'], scope: {}, tag: principal.startsWith('a_') ? 'st_a' : 'st_b' }) },
      readAs: noRows,
      idleMs: 0,
    });
    await identity.resolve('a_1');
    await identity.resolve('a_2');
    await identity.resolve('b_1');
    expect(identity.roster?.meter().size).toBe(3);

    expect(identity.invalidate('b_1')).toBe(true);
    expect(identity.invalidateTag('st_a')).toEqual(['a_1', 'a_2']);
    expect(identity.roster?.list()).toEqual([]);

    await identity.resolve('a_1');
    expect(asked).toBe(4);
    identity.invalidateAll();
    await identity.resolve('a_1');
    expect(asked).toBe(5);
    identity.stop();
  });
});

describe('what the identity seam answers is parsed', () => {
  const answering = (answered: unknown): NonNullable<IdentityConfig['seam']> => ({ resolve: async () => answered as IdentityRecord });

  it.each([
    ['nothing', undefined],
    ['roles that are not a list', { roles: 'member', scope: {} }],
    ['a role that is not a string', { roles: ['member', 7], scope: {} }],
    ['no scope', { roles: ['member'] }],
    ['a scope that is not an object', { roles: ['member'], scope: 'st_a' }],
    ['installs that are not a list', { roles: ['member'], scope: {}, installed: 'mail' }],
    ['a tag that is not a string', { roles: ['member'], scope: {}, tag: 7 }],
  ])('refuses %s with a sentence, and holds nothing', async (_what, answered) => {
    const identity = createIdentity({ seam: answering(answered), readAs: noRows, idleMs: 0 });
    await expect(identity.resolve('p_ava')).rejects.toThrow(/identity\.resolve/);
    expect(identity.roster?.meter().size).toBe(0);
    identity.stop();
  });

  it('says which field, and nothing of what the record held', async () => {
    const identity = createIdentity({ seam: answering({ roles: 's3cret-role', scope: { email: 'ava@s3cret.example' }, tag: 7 }), readAs: noRows, idleMs: 0 });
    const refusal = await identity.resolve('p_ava').then(
      () => '',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    expect(refusal).toContain('roles');
    expect(refusal).toContain('tag');
    expect(refusal).not.toContain('s3cret');
    identity.stop();
  });

  it('a refusal is not held: the next ask goes back to the seam', async () => {
    let attempt = 0;
    const identity = createIdentity({
      seam: { resolve: async () => ((attempt += 1), attempt === 1 ? ({ roles: 'member' } as unknown as IdentityRecord) : { roles: ['member'], scope: {} }) },
      readAs: noRows,
      idleMs: 0,
    });
    await expect(identity.resolve('p_ava')).rejects.toThrow(/identity\.resolve/);
    expect((await identity.resolve('p_ava')).roles).toEqual(['member']);
    identity.stop();
  });

  it('leaves alone what it does not name: a field the app added still reaches its scope hook', async () => {
    const identity = createIdentity({
      seam: answering({ roles: ['member'], scope: { studioId: 'st_a' }, timezone: 'Europe/Vienna' }),
      scope: (_principal, record) => ({ timezone: record !== undefined && 'timezone' in record ? record.timezone : 'unknown' }),
      readAs: noRows,
      idleMs: 0,
    });
    expect(await identity.scopeValuesFor('p_ava')).toEqual({ userId: 'p_ava', studioId: 'st_a', timezone: 'Europe/Vienna' });
    identity.stop();
  });
});
