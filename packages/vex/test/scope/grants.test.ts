import { describe, it, expect } from 'vitest';
import { SCOPE_VERBS, scopeGrants, createScopePolicy } from '../../src/scope/grants.js';
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
});
