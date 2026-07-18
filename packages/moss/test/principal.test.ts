import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import { resolveRoles, resolvePolicy, resolveCatalog, resolveVariants, verifyVariants } from '../src/principal';
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

// Ring 2: the same app, plus a basic variant of crm.deals granted to viewer
// — and denied back in sales, since `extends` composes every section.
const basic = { component: 'Text', children: 'basic' };
const varApp = {
  ...app,
  charter: {
    ...app.charter,
    viewer: { actions: ['crm.*.view'], data: ['*.read'], layouts: ['crm.deals.basic'] },
    sales: {
      extends: ['viewer'],
      actions: ['crm.*'],
      data: ['deals.write.insert', 'deals.write.update'],
      layouts: { deny: ['crm.deals.basic'] },
    },
  },
  layouts: { 'crm.deals.basic': { action: 'crm.deals', layout: basic } },
} as unknown as NiscApp;

describe('principal — ring-2 variant resolution', () => {
  it('a granted variant binds its action to its layout; holding none binds nothing', () => {
    expect(resolveVariants(varApp, 'usr_2').get('crm.deals')).toBe(basic); // viewer
    expect(resolveVariants(varApp, 'usr_1').size).toBe(0);                 // sales denied it back
    expect(resolveVariants(varApp, null).size).toBe(0);                    // anonymous
  });

  it('a coherent app verifies clean; no layouts at all verifies clean', () => {
    expect(verifyVariants(varApp)).toEqual([]);
    expect(verifyVariants(app)).toEqual([]);
  });

  it('a variant reshaping an unknown action is refused', () => {
    const broken = { ...varApp, layouts: { ghost: { action: 'crm.ghost', layout: basic } } } as unknown as NiscApp;
    expect(verifyVariants(broken).some((e) => e.includes('unknown action "crm.ghost"'))).toBe(true);
  });

  it('two variants of one action — held by a role, or only by a principal\'s role UNION — are refused', () => {
    const twoOnRole = {
      ...varApp,
      layouts: {
        'crm.deals.basic': { action: 'crm.deals', layout: basic },
        'crm.deals.dense': { action: 'crm.deals', layout: basic },
      },
      charter: { ...varApp.charter, viewer: { actions: ['crm.*.view'], layouts: ['crm.deals.*'] } },
    } as unknown as NiscApp;
    expect(verifyVariants(twoOnRole).some((e) => e.includes('role "viewer"') && e.includes('crm.deals'))).toBe(true);

    const twoAcrossRoles = {
      ...varApp,
      layouts: {
        'crm.deals.basic': { action: 'crm.deals', layout: basic },
        'crm.deals.dense': { action: 'crm.deals', layout: basic },
      },
      charter: {
        ...varApp.charter,
        viewer: { actions: ['crm.*.view'], layouts: ['crm.deals.basic'] },
        dense: { layouts: ['crm.deals.dense'] },
      },
      assignments: { usr_2: ['viewer', 'dense'] },
    } as unknown as NiscApp;
    const errors = verifyVariants(twoAcrossRoles);
    expect(errors.some((e) => e.includes('role'))).toBe(false); // each role alone is coherent
    expect(errors.some((e) => e.includes('principal "usr_2"') && e.includes('crm.deals'))).toBe(true);
  });
});
