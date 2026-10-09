import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ScopeBehaviors, ScopePolicy } from '@niscorp/vex';
import type { Charter } from '@niscorp/charter';
import { memoKey } from '../src/identity';
import { createPolicies } from '../src/data/policy';

// WHAT A SET OF ROLES MAY READ AND WRITE, kept. No engine and no database: a
// charter, the row behaviors, and the tables there are to grant.

const charter: Charter = {
  public: [],
  viewer: { data: ['*.read'] },
  member: { data: ['bookings.read', 'bookings.write.insert'], scoping: 'personal' },
};

const tenant = { match: 'studio_id', to: 'studioId' };
const behaviors: ScopeBehaviors = {
  deals: { read: [tenant] },
  bookings: {
    default: { read: [tenant] },
    desk: { read: [tenant] },
    personal: { read: [tenant, { match: 'person_id', to: 'userId' }], insert: [{ set: 'person_id', to: 'userId' }] },
  },
};

const grants = scopeGrants(['bookings', 'deals']);

const who = (...roles: string[]) => ({ key: memoKey(roles, undefined), roles });

// The rules a policy puts on one phase of a table: `undefined` where the phase
// is not granted.
const rulesOn = (policy: ScopePolicy, table: string, phase: 'read' | 'insert'): readonly unknown[] | undefined => {
  const entity = policy.entities[table];
  return entity === undefined || 'public' in entity || 'deny' in entity ? undefined : entity[phase];
};

describe('createPolicies — the policy for a set of roles, kept', () => {
  it('compiles what the roles are granted, under the rules of their reach', () => {
    const policies = createPolicies({ charter, behaviors, grants });
    const viewer = policies.of(who('viewer'));
    expect(viewer.default).toBe('deny');
    expect(rulesOn(viewer, 'deals', 'read')).toEqual([tenant]);
    expect(rulesOn(viewer, 'deals', 'insert')).toBeUndefined();
    const member = policies.of(who('member'));
    expect(rulesOn(member, 'bookings', 'read')).toHaveLength(2);
    expect(rulesOn(member, 'bookings', 'insert')).toEqual([{ set: 'person_id', to: 'userId' }]);
    expect(rulesOn(member, 'deals', 'read')).toBeUndefined();
  });

  it('answers the same policy for the same set of roles, and compiles each set once', () => {
    const policies = createPolicies({ charter, behaviors, grants });
    const first = policies.of(who('viewer'));
    expect(policies.of(who('viewer'))).toBe(first);
    expect(policies.of(who('member'))).not.toBe(first);
  });

  it('keeps a policy at a reach by the roles and the reach', () => {
    const policies = createPolicies({ charter, behaviors, grants });
    const both = who('viewer', 'member');
    const personal = policies.atReach(both, 'personal');
    expect(policies.atReach(both, 'personal')).toBe(personal);
    const desk = policies.atReach(both, 'desk');
    expect(desk).not.toBe(personal);
    // Same verbs, narrower rows: at the personal reach bookings are pinned by
    // the person as well as by the studio, and deals are read either way.
    expect(rulesOn(personal, 'bookings', 'read')).toHaveLength(2);
    expect(rulesOn(desk, 'bookings', 'read')).toEqual([tenant]);
    expect(rulesOn(personal, 'deals', 'read')).toEqual([tenant]);
  });

  it('drops both when it is told to, so the next ask compiles again', () => {
    const policies = createPolicies({ charter, behaviors, grants });
    const own = policies.of(who('viewer'));
    const atReach = policies.atReach(who('viewer'), 'personal');
    policies.drop();
    expect(policies.of(who('viewer'))).not.toBe(own);
    expect(policies.of(who('viewer'))).toEqual(own);
    expect(policies.atReach(who('viewer'), 'personal')).not.toBe(atReach);
  });

  it('an app with no behaviors compiles the grants with no row rule', () => {
    const policies = createPolicies({ charter, grants });
    expect(rulesOn(policies.of(who('viewer')), 'deals', 'read')).toEqual([]);
  });
});
