import { describe, it, expect } from 'vitest';
import { resolveRole, resolvePrincipal, verifyCharter, CharterError, matchGlob } from '../src/index';
import type { Charter } from '../src/index';

// The grammar corpus — the algebra from CHARTER.md, exercised on synthetic
// charters over synthetic universes. The engine is universe-blind: these
// strings mean nothing, which is the point.

const gids = ['a.one', 'a.two', 'b.one'];
const G: Charter = {
  base: ['a.*'], // bare array → actions sugar
  denyWins: { actions: { allow: ['a.*'], deny: ['a.two'] } },
  child: { extends: ['denyWins'], actions: ['a.two'] },
  muzzle: ['a.one'],
  narrowed: { extends: ['base'], without: ['muzzle'] },
};

const sorted = (s: ReadonlySet<string>): string[] => [...s].sort();

describe('glob', () => {
  it('* crosses dots', () => {
    expect(matchGlob('a.*', 'a.one')).toBe(true);
    expect(matchGlob('*', 'a.one')).toBe(true);
  });
});

describe('resolution', () => {
  it('a bare array is the actions section', () => {
    expect(sorted(resolveRole(G, gids, 'base', 'actions'))).toEqual(['a.one', 'a.two']);
    expect(sorted(resolveRole(G, gids, 'base', 'data'))).toEqual([]);
  });

  it('deny wins within a role', () => {
    expect(sorted(resolveRole(G, gids, 'denyWins', 'actions'))).toEqual(['a.one']);
  });

  it('denies do not inherit — a child may re-add', () => {
    expect(sorted(resolveRole(G, gids, 'child', 'actions'))).toEqual(['a.one', 'a.two']);
  });

  it('without subtracts a resolved set', () => {
    expect(sorted(resolveRole(G, gids, 'narrowed', 'actions'))).toEqual(['a.two']);
  });

  it('a principal is the union of their roles', () => {
    expect(resolvePrincipal(G, gids, ['muzzle', 'denyWins']).size).toBe(1);
  });

  it('sections resolve in their own universes', () => {
    const D: Charter = { reader: { data: ['x.read'] }, writer: { extends: ['reader'], data: ['x.write.*'] } };
    const u = ['x.read', 'x.write.insert', 'x.write.update'];
    expect(sorted(resolveRole(D, u, 'writer', 'data'))).toEqual(u);
  });

  it('cycles are an error; unknown roles are an error', () => {
    expect(() => resolveRole({ a: { extends: ['b'] }, b: { extends: ['a'] } }, gids, 'a', 'actions')).toThrow(CharterError);
    expect(() => resolveRole(G, gids, 'ghost', 'actions')).toThrow(CharterError);
  });

  it('the layouts section resolves in its own universe; a bare array grants none', () => {
    const L: Charter = {
      viewer: { actions: ['a.*'], layouts: ['a.one.basic'] },
      sales: { extends: ['viewer'], layouts: { deny: ['a.one.basic'] } },
      bare: ['a.*'],
    };
    const variants = ['a.one.basic', 'a.two.compact'];
    expect(sorted(resolveRole(L, variants, 'viewer', 'layouts'))).toEqual(['a.one.basic']);
    // extends composes every section — a child sheds an inherited variant by denying it
    expect(sorted(resolveRole(L, variants, 'sales', 'layouts'))).toEqual([]);
    expect(sorted(resolveRole(L, variants, 'bare', 'layouts'))).toEqual([]);
  });
});

describe('verifier', () => {
  const universes = (actions: readonly string[], data: readonly string[] = []) => ({ actions, data });

  it('a dead deny is an ERROR; a dead allow is a warning', () => {
    const r1 = verifyCharter({ r: { actions: { allow: ['a.*'], deny: ['zz.*'] } } }, universes(gids));
    expect(r1.errors.some((e) => e.rule === 'dead-deny')).toBe(true);
    const r2 = verifyCharter({ r: ['zz.*'], all: ['*'] }, universes(gids));
    expect(r2.warnings.some((w) => w.rule === 'dead-allow')).toBe(true);
  });

  it('a dead DATA deny is an ERROR too — per section, right universe', () => {
    const r = verifyCharter({ r: { data: { allow: ['x.read'], deny: ['zz.write.*'] } } }, universes(gids, ['x.read']));
    expect(r.errors.some((e) => e.rule === 'dead-deny')).toBe(true);
  });

  it('top-level allow + an actions section is an ERROR (silent drop)', () => {
    const r = verifyCharter({ r: { allow: ['a.*'], actions: ['a.one'] }, all: ['*'] }, universes(gids));
    expect(r.errors.some((e) => e.rule === 'ambiguous-selection')).toBe(true);
  });

  it('an orphan action is a warning; namespaces are never actions', () => {
    expect(verifyCharter({ r: ['a.*'] }, universes(gids)).warnings.some((w) => w.rule === 'orphan')).toBe(true);
    expect(verifyCharter({ r: ['*'] }, universes(['a', 'a.one'])).errors.some((e) => e.rule === 'leaves-only')).toBe(true);
  });

  it('re-allow of an ancestor deny is flagged; an assigned subtractive role is flagged', () => {
    expect(verifyCharter({ ...G, all: ['*'] }, universes(gids)).warnings.some((w) => w.rule === 're-allow')).toBe(true);
    expect(
      verifyCharter({ ...G, all: ['*'] }, universes(gids), { u1: ['muzzle'] }).warnings.some((w) => w.rule === 'subtractive-assigned'),
    ).toBe(true);
  });

  it('the closure auditor is injected and fed each role\'s granted set', () => {
    const seen: string[][] = [];
    const report = verifyCharter({ r: ['a.*'], all: ['*'] }, universes(gids), {}, (ids) => {
      seen.push([...ids]);
      return ids.includes('b.one') ? ['b.one: dangles'] : [];
    });
    expect(seen.length).toBe(2);
    const all = report.perRole.find((p) => p.role === 'all');
    expect(all?.issues).toEqual(['b.one: dangles']);
  });

  it('the layouts universe is verified only when handed in', () => {
    const charter: Charter = { r: { actions: ['a.*'], layouts: ['a.one.basic'] }, all: ['*'] };
    // No layouts universe → the section is inert: no dead-allow for it.
    const without = verifyCharter(charter, universes(gids));
    expect(without.warnings.some((w) => w.detail.includes('layouts'))).toBe(false);
    // Handed in → dead denies are errors, orphans are warnings, per-role sets carry it.
    const withU = verifyCharter(
      { r: { actions: ['a.*'], layouts: { allow: ['a.one.basic'], deny: ['zz.*'] } }, all: ['*'] },
      { ...universes(gids), layouts: ['a.one.basic', 'a.two.compact'] },
    );
    expect(withU.errors.some((e) => e.rule === 'dead-deny' && e.detail.includes('layouts'))).toBe(true);
    expect(withU.warnings.some((w) => w.rule === 'orphan' && w.detail.includes('a.two.compact'))).toBe(true);
    expect(withU.perRole.find((p) => p.role === 'r')?.layouts).toEqual(['a.one.basic']);
  });

  it('the closure auditor receives each role\'s granted variant ids', () => {
    const seen: Array<readonly string[] | undefined> = [];
    verifyCharter(
      { r: { actions: ['a.*'], layouts: ['a.one.basic'] } },
      { ...universes(gids), layouts: ['a.one.basic'] },
      {},
      (_ids, layoutIds) => {
        seen.push(layoutIds);
        return [];
      },
    );
    expect(seen).toEqual([['a.one.basic']]);
  });
});
