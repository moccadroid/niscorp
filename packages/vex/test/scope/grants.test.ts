import { describe, it, expect } from 'vitest';
import { SCOPE_VERBS, scopeGrants, createScopePolicy, scopeProfiles, mergeScopePolicies } from '../../src/scope/grants.js';
import type { ScopeBehaviors } from '../../src/scope/grants.js';
import type { ScopeMatch, ScopeRule } from '../../src/scope/scope.types.js';

// The behaviors an app would own: tasks personal (umbrella set+match),
// everything else rule-free or unlisted.
const behaviors: ScopeBehaviors = {
  tasks: {
    read: [{ match: 'assignee_id', to: 'userId' }],
    write: [
      { set: 'assignee_id', to: 'userId' },
      { match: 'assignee_id', to: 'userId' },
    ],
  },
};

type Phases = { read?: ScopeMatch[]; insert?: ScopeRule[]; update?: ScopeRule[]; delete?: ScopeMatch[] };
const phases = (p: ReturnType<typeof createScopePolicy>, t: string): Phases | undefined => p.entities[t] as Phases | undefined;

describe('scopeGrants', () => {
  it('is tables × SCOPE_VERBS', () => {
    const u = scopeGrants(['deals', 'tasks']);
    expect(u).toHaveLength(2 * SCOPE_VERBS.length);
    expect(u).toContain('deals.read');
    expect(u).toContain('tasks.write.delete');
    expect(u).not.toContain('deals.write'); // the namespace is never a grant
  });
});

describe('createScopePolicy', () => {
  it('emits specific phases only, default deny', () => {
    const p = createScopePolicy(new Set(['deals.read', 'deals.write.insert', 'deals.write.update']), behaviors);
    expect(p.default).toBe('deny');
    const deals = phases(p, 'deals');
    expect(deals?.read).toEqual([]);
    expect(deals?.insert).toEqual([]);
    expect(deals?.update).toEqual([]);
    expect(deals?.delete).toBeUndefined(); // ungranted phase is ABSENT
    expect((p.entities['deals'] as { write?: unknown }).write).toBeUndefined(); // never the umbrella
  });

  it('a granted phase carries umbrella behaviors plus its own; delete keeps matches only', () => {
    const p = createScopePolicy(new Set(['tasks.read', 'tasks.write.insert', 'tasks.write.delete']), behaviors);
    const tasks = phases(p, 'tasks');
    expect(tasks?.read).toEqual([{ match: 'assignee_id', to: 'userId' }]);
    expect(tasks?.insert).toHaveLength(2); // umbrella set + match
    expect(tasks?.delete).toEqual([{ match: 'assignee_id', to: 'userId' }]); // set filtered out
  });

  it('an unlisted table with a grant gets a rule-free phase; a table with no grant is absent', () => {
    const p = createScopePolicy(new Set(['users.read']), behaviors);
    expect(phases(p, 'users')?.read).toEqual([]);
    expect(p.entities['pipelines']).toBeUndefined();
  });

  it('behaviors default to none; malformed grants are ignored', () => {
    const p = createScopePolicy(new Set(['deals.read', 'nonsense', 'deals.write.frobnicate']));
    expect(phases(p, 'deals')?.read).toEqual([]);
    expect(Object.keys(p.entities)).toEqual(['deals']);
    const deals = phases(p, 'deals');
    expect(deals?.insert).toBeUndefined();
  });

  // ── SCOPING PROFILES: reach is a property of the rung ──
  //
  // What these exist for: one table, two rungs, different reach. A desk reads
  // every booking at its studio; a member reads their own. With one rule per
  // table that is unsayable, and the only way to say it was a SECOND TABLE
  // carrying the tighter rule — one fact in two places, kept level by a trigger.
  //
  // The profile is chosen ONCE per principal rather than repeated on every
  // grant, because "acts for themselves" is true of the person, not of each
  // thing they read.
  describe('scoping profiles', () => {
    const named: ScopeBehaviors = {
      bookings: {
        default: { read: [{ match: 'studio_id', to: 'studioId' }] },
        personal: {
          read: [
            { match: 'studio_id', to: 'studioId' },
            { match: 'membership_id', to: 'membershipId' },
          ],
        },
      },
      // A shared table declares no variant: everybody reads it the same way, and
      // a profiled principal falls back to this without an entry per profile.
      class_sessions: { default: { read: [{ match: 'studio_id', to: 'studioId' }] } },
    };

    it('no profile gets the default', () => {
      const p = createScopePolicy(new Set(['bookings.read']), named);
      expect(phases(p, 'bookings')?.read).toEqual([{ match: 'studio_id', to: 'studioId' }]);
    });

    it('a profile gets the tighter reach — same table, same grant, same fingerprint', () => {
      const p = createScopePolicy(new Set(['bookings.read']), named, 'personal');
      expect(phases(p, 'bookings')?.read).toEqual([
        { match: 'studio_id', to: 'studioId' },
        { match: 'membership_id', to: 'membershipId' },
      ]);
    });

    it('...while a table with no variant falls back to its default', () => {
      const p = createScopePolicy(new Set(['class_sessions.read']), named, 'personal');
      expect(phases(p, 'class_sessions')?.read).toEqual([{ match: 'studio_id', to: 'studioId' }]);
    });

    // THE ONE THAT MATTERS. A mistyped profile must not mean "the default" — it
    // would widen a member to every row of every table they hold a grant on.
    it('an unknown profile grants nothing at all, on any table', () => {
      const p = createScopePolicy(new Set(['bookings.read', 'class_sessions.read']), named, 'persona1');
      expect(p.entities).toEqual({});
      expect(p.default).toBe('deny');
    });

    it('a table with named variants and no default refuses an unprofiled principal', () => {
      const p = createScopePolicy(new Set(['bookings.read']), { bookings: { personal: { read: [] } } });
      expect(p.entities['bookings']).toBeUndefined();
    });

    it('the old plain shape is unchanged, profiled or not', () => {
      const plain = createScopePolicy(new Set(['tasks.read']), behaviors);
      const profiled = createScopePolicy(new Set(['tasks.read']), { ...behaviors, x: { default: {}, personal: {} } }, 'personal');
      expect(phases(plain, 'tasks')?.read).toEqual([{ match: 'assignee_id', to: 'userId' }]);
      expect(phases(profiled, 'tasks')?.read).toEqual([{ match: 'assignee_id', to: 'userId' }]);
    });

    it('writes take the profile too', () => {
      const own: ScopeBehaviors = {
        bookings: { default: {}, personal: { write: [{ set: 'membership_id', to: 'membershipId' }] } },
      };
      expect(phases(createScopePolicy(new Set(['bookings.write.insert']), own), 'bookings')?.insert).toEqual([]);
      expect(phases(createScopePolicy(new Set(['bookings.write.insert']), own, 'personal'), 'bookings')?.insert).toEqual([
        { set: 'membership_id', to: 'membershipId' },
      ]);
    });

    it('scopeProfiles lists what a behavior map declares', () => {
      expect([...scopeProfiles(named)]).toEqual(['personal']);
      expect([...scopeProfiles(behaviors)]).toEqual([]);
    });
  });
});

// ── SEVERAL ROLES, one principal ──
//
// The case this exists for: an instructor who also trains. Staff on the roster
// (studio-wide reads), a member in the class (their own writes). One profile per
// PRINCIPAL cannot describe that; one per ROLE can, and the policies merge.
describe('merging per-role policies', () => {
  const behaviors: ScopeBehaviors = {
    bookings: {
      default: { read: [{ match: 'studio_id', to: 'studioId' }] },
      personal: {
        read: [{ match: 'studio_id', to: 'studioId' }, { match: 'membership_id', to: 'membershipId' }],
        write: [{ set: 'membership_id', to: 'membershipId' }, { match: 'studio_id', to: 'studioId' }],
      },
    },
  };

  const asStaff = createScopePolicy(new Set(['bookings.read']), behaviors);
  const asMember = createScopePolicy(new Set(['bookings.read', 'bookings.write.insert']), behaviors, 'personal');
  const both = mergeScopePolicies([asStaff, asMember]);

  it('takes the widest read — the roster stays readable', () => {
    expect(phases(both, 'bookings')?.read).toEqual([{ match: 'studio_id', to: 'studioId' }]);
  });

  it('...while keeping a write only one role grants, stamp and all', () => {
    expect(phases(both, 'bookings')?.insert).toEqual([
      { set: 'membership_id', to: 'membershipId' },
      { match: 'studio_id', to: 'studioId' },
    ]);
  });

  it('order does not matter', () => {
    const flipped = mergeScopePolicies([asMember, asStaff]);
    expect(phases(flipped, 'bookings')).toEqual(phases(both, 'bookings'));
  });

  it('a phase no role grants stays refused', () => {
    expect(phases(both, 'bookings')?.delete).toBeUndefined();
    expect(both.default).toBe('deny');
  });

  it('one role alone is unchanged by merging', () => {
    expect(mergeScopePolicies([asMember]).entities).toEqual(asMember.entities);
  });
});
