import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import { resolveRoles, resolvePolicy, resolveCatalog } from '../src/principal';
import type { NiscApp } from '../src/app';

// A minimal app — just enough charter/assignments/actions to exercise
// per-principal resolution. No database, no shell.
const app = {
  charter: {
    public: ['auth.login'],
    viewer: { actions: ['crm.*.view'], data: ['*.read'] },
    sales: { extends: ['viewer'], actions: ['crm.*'], data: ['deals.write.insert', 'deals.write.update'] },
  },
  assignments: { usr_1: ['sales'], usr_2: ['viewer'] },
  actions: {
    'auth.login': { id: 'auth.login' },
    'crm.deals': { id: 'crm.deals' },
    'crm.deal.view': { id: 'crm.deal.view' },
    'crm.deal.form': { id: 'crm.deal.form' },
  },
} as unknown as NiscApp;

const grants = scopeGrants(['deals', 'contacts']);

describe('principal — per-principal resolution', () => {
  it('an unassigned or anonymous principal wears public', () => {
    expect(resolveRoles(app, null)).toEqual(['public']);
    expect(resolveRoles(app, 'nobody')).toEqual(['public']);
  });

  it('an assigned principal wears its roles', () => {
    expect(resolveRoles(app, 'usr_1')).toEqual(['sales']);
  });

  it('the catalog is the resolved action ids, sorted, with a version token', () => {
    const cat = resolveCatalog(app, 'usr_1');
    expect(cat.ids).toContain('crm.deals');
    expect(cat.ids).toContain('crm.deal.form');
    expect([...cat.ids]).toEqual([...cat.ids].sort());
    expect(cat.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('equal id sets produce equal version tokens; different sets differ', () => {
    const a = resolveCatalog(app, 'usr_1').hash;
    const b = resolveCatalog(app, 'usr_1').hash;
    const c = resolveCatalog(app, 'usr_2').hash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('anonymous sees only the lock screen', () => {
    expect(resolveCatalog(app, null).ids).toEqual(['auth.login']);
  });

  it('the compiled policy carries the resolved data grants (default-deny elsewhere)', () => {
    const policy = resolvePolicy(app, grants, 'usr_1');
    expect(policy.default).toBe('deny');
    expect(policy.entities['deals']?.read).toBeDefined();     // viewer's *.read
    expect(policy.entities['deals']?.insert).toBeDefined();   // sales write
    expect(policy.entities['deals']?.delete).toBeUndefined(); // never granted
  });
});
