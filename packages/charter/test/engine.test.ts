import { describe, it, expect } from 'vitest';
import { resolveRole, resolvePrincipal, resolveScoping, verifyCharter, CharterError, matchGlob } from '../src/index';
import type { Charter } from '../src/index';

const gids = ['a.one', 'a.two', 'b.one'];
const G: Charter = {
  base: ['a.*'],
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

  it('a pattern of many stars against a long id that it does not match answers at once', () => {
    const started = Date.now();
    expect(matchGlob('*a*a*a*a*a*a*a*a*a*a*b', 'a'.repeat(40))).toBe(false);
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('answers what a regular expression of the pattern answers', () => {
    const regexOf = (pattern: string): RegExp => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's');
    const alphabet = ['a', 'b', '.', '*', '\n'];
    let seed = 7;
    const next = (n: number): number => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    const word = (max: number, chars: readonly string[]): string => Array.from({ length: next(max) }, () => chars[next(chars.length)]).join('');
    for (let i = 0; i < 20000; i++) {
      const pattern = word(7, alphabet);
      const id = word(9, alphabet.filter((c) => c !== '*'));
      expect([pattern, id, matchGlob(pattern, id)]).toEqual([pattern, id, regexOf(pattern).test(id)]);
    }
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
    expect(sorted(resolveRole(L, variants, 'sales', 'layouts'))).toEqual([]);
    expect(sorted(resolveRole(L, variants, 'bare', 'layouts'))).toEqual([]);
  });

  it('the functions section resolves in its own universe, as the others do; a role with none, or a bare array, grants none', () => {
    const F: Charter = {
      member: { actions: ['a.*'], functions: ['notes.*'] },
      editor: { extends: ['member'], functions: { allow: ['publish'], deny: ['notes.delete'] } },
      silent: { actions: ['a.*'] },
      bare: ['a.*'],
    };
    const functions = ['notes.add', 'notes.delete', 'publish', 'auth.leave'];
    expect(sorted(resolveRole(F, functions, 'member', 'functions'))).toEqual(['notes.add', 'notes.delete']);
    expect(sorted(resolveRole(F, functions, 'editor', 'functions'))).toEqual(['notes.add', 'publish']);
    expect(sorted(resolveRole(F, functions, 'silent', 'functions'))).toEqual([]);
    expect(sorted(resolveRole(F, functions, 'bare', 'functions'))).toEqual([]);
    expect(sorted(resolvePrincipal(F, functions, ['silent', 'member'], 'functions'))).toEqual(['notes.add', 'notes.delete']);
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
      verifyCharter({ ...G, all: ['*'] }, universes(gids), [['muzzle']]).warnings.some((w) => w.rule === 'subtractive-assigned'),
    ).toBe(true);
  });

  it('the closure auditor is injected and fed each role\'s granted set', () => {
    const seen: string[][] = [];
    const report = verifyCharter({ r: ['a.*'], all: ['*'] }, universes(gids), [], (ids) => {
      seen.push([...ids]);
      return ids.includes('b.one') ? ['b.one: dangles'] : [];
    });
    expect(seen.length).toBe(2);
    const all = report.perRole.find((p) => p.role === 'all');
    expect(all?.issues).toEqual(['b.one: dangles']);
  });

  it('the layouts universe is verified only when handed in', () => {
    const charter: Charter = { r: { actions: ['a.*'], layouts: ['a.one.basic'] }, all: ['*'] };
    const without = verifyCharter(charter, universes(gids));
    expect(without.warnings.some((w) => w.detail.includes('layouts'))).toBe(false);
    const withU = verifyCharter(
      { r: { actions: ['a.*'], layouts: { allow: ['a.one.basic'], deny: ['zz.*'] } }, all: ['*'] },
      { ...universes(gids), layouts: ['a.one.basic', 'a.two.compact'] },
    );
    expect(withU.errors.some((e) => e.rule === 'dead-deny' && e.detail.includes('layouts'))).toBe(true);
    expect(withU.warnings.some((w) => w.rule === 'orphan' && w.detail.includes('a.two.compact'))).toBe(true);
    expect(withU.perRole.find((p) => p.role === 'r')?.layouts).toEqual(['a.one.basic']);
  });

  it('the functions universe is verified only when handed in: a grant that matches nothing, a deny that matches nothing, a function no role grants', () => {
    const charter: Charter = { r: { actions: ['a.*'], functions: { allow: ['notes.ad', 'notes.list'], deny: ['zz.*'] } }, all: ['*'] };
    const without = verifyCharter(charter, universes(gids));
    expect([...without.errors, ...without.warnings].some((issue) => issue.detail.includes('(functions)'))).toBe(false);

    const withU = verifyCharter(charter, { ...universes(gids), functions: ['notes.add', 'notes.list'] });
    expect(withU.warnings).toContainEqual({ level: 'warning', rule: 'dead-allow', detail: 'role "r" allows "notes.ad" (functions) which matches nothing' });
    expect(withU.errors).toContainEqual({ level: 'error', rule: 'dead-deny', detail: 'role "r" denies "zz.*" (functions) which matches nothing — silent means unprotected' });
    expect(withU.warnings).toContainEqual({ level: 'warning', rule: 'orphan', detail: 'function "notes.add" is granted by no role — deployed but unreachable' });
  });

  it('the closure auditor receives each role\'s granted variant ids', () => {
    const seen: Array<readonly string[] | undefined> = [];
    verifyCharter(
      { r: { actions: ['a.*'], layouts: ['a.one.basic'] } },
      { ...universes(gids), layouts: ['a.one.basic'] },
      [],
      (_ids, layoutIds) => {
        seen.push(layoutIds);
        return [];
      },
    );
    expect(seen).toEqual([['a.one.basic']]);
  });
});

describe('a charter as it is read from JSON', () => {
  const crm = ['crm.deal.view', 'crm.deal.edit', 'crm.deal.delete', 'hr.pay'];
  const fromJson = (text: string): Charter => JSON.parse(text);
  const shapeOf = (charter: Charter): string[] =>
    verifyCharter(charter, { actions: crm, data: [] }).warnings.flatMap((warning) => (warning.rule === 'shape' ? [warning.detail] : []));

  it('a key the charter does not read is said, in a role and in a section', () => {
    const charter = fromJson('{"admin":{"allow":["crm.*"],"denny":["crm.deal.delete"]},"desk":{"actions":{"allow":["crm.*"],"Deny":["crm.deal.delete"]}}}');
    expect(shapeOf(charter)).toEqual([
      'role "admin" has the key "denny", which the charter does not read: what it lists does not apply',
      'role "desk" has the key "actions.Deny", which the charter does not read: what it lists does not apply',
    ]);
  });

  it('a string where a list of globs belongs is that one glob, and never each of its characters', () => {
    expect(sorted(resolvePrincipal(fromJson('{"viewer":{"allow":"crm.deal.view*"}}'), crm, ['viewer']))).toEqual(['crm.deal.view']);
    expect(sorted(resolvePrincipal(fromJson('{"viewer":{"actions":{"allow":"crm.deal.view*"}}}'), crm, ['viewer']))).toEqual(['crm.deal.view']);
    expect(sorted(resolvePrincipal(fromJson('{"editor":{"allow":["crm.*"],"deny":"crm.deal.delete"}}'), crm, ['editor']))).toEqual(['crm.deal.edit', 'crm.deal.view']);
    expect(shapeOf(fromJson('{"viewer":{"allow":"crm.deal.view*"},"all":["*"]}'))).toEqual(['role "viewer": "allow" is the string "crm.deal.view*", read as the list ["crm.deal.view*"]']);
  });

  it('a string where a list of roles belongs is that one role', () => {
    const charter = fromJson('{"base":["crm.deal.view","crm.deal.edit"],"muzzle":["crm.deal.edit"],"child":{"extends":"base","without":"muzzle"},"all":["*"]}');
    expect(sorted(resolveRole(charter, crm, 'child', 'actions'))).toEqual(['crm.deal.view']);
    expect(verifyCharter(charter, { actions: crm, data: [] }).errors).toEqual([]);
  });

  it('a role or a section that is a string grants nothing, and is said', () => {
    const charter = fromJson('{"viewer":"crm.*","reader":{"actions":"crm.*"},"all":["*"]}');
    expect(sorted(resolvePrincipal(charter, crm, ['viewer', 'reader']))).toEqual([]);
    expect(shapeOf(charter)).toEqual([
      'role "viewer" is the string "crm.*", which grants nothing: a role is a list of globs or an object',
      'role "reader": "actions" is the string "crm.*", which grants nothing: a section is a list of globs or { allow, deny }',
    ]);
  });
});

describe('glob — a line break is a character like any other', () => {
  it('* matches across it, so a deny of a namespace covers an id with one', () => {
    expect(matchGlob('crm.*', 'crm.a\nb')).toBe(true);
    expect(sorted(resolvePrincipal({ r: { allow: ['crm.a\nb', 'crm.view'], deny: ['crm.a*'] } }, ['crm.a\nb', 'crm.view'], ['r']))).toEqual(['crm.view']);
  });
});

describe('a charter as it is read from JSON — a value that is neither a list nor a string', () => {
  const crm = ['crm.deal.view', 'crm.deal.edit', 'crm.deal.delete'];
  const fromJson = (text: string): Charter => JSON.parse(text);

  it('where it would grant, it grants nothing and is said; the verifier does not throw', () => {
    const charter = fromJson('{"a":{"allow":5},"b":{"allow":["crm.deal.view",5]},"c":"crm.*","d":{"actions":7},"all":["*"]}');
    const report = verifyCharter(charter, { actions: crm, data: [] });
    expect(report.errors).toEqual([]);
    expect(report.warnings.filter((warning) => warning.rule === 'shape').map((warning) => warning.detail)).toEqual([
      'role "a": "allow" is 5, which is not a list: it grants nothing',
      'role "b": "allow" lists 5, which is not a string: it grants nothing',
      'role "c" is the string "crm.*", which grants nothing: a role is a list of globs or an object',
      'role "d": "actions" is 7, which grants nothing: a section is a list of globs or { allow, deny }',
    ]);
    expect(sorted(resolvePrincipal(charter, crm, ['a', 'b', 'c', 'd']))).toEqual(['crm.deal.view']);
  });

  it('a scoping that is not a name is handed on as written, and is said', () => {
    const charter = fromJson('{"counted":{"allow":["*"],"scoping":5},"blank":{"allow":["*"],"scoping":null}}');
    expect(resolveScoping(charter, 'counted')).toBe(5);
    expect(resolveScoping(charter, 'blank')).toBeNull();
    expect(verifyCharter(charter, { actions: crm, data: [] }).warnings.map((warning) => warning.detail)).toEqual([
      'role "counted": "scoping" is 5, which is not a name: the role reaches no rows',
      'role "blank": "scoping" is null, which is not a name: the role reaches no rows',
    ]);
  });

  it('where it would take away, the role is refused: the verifier says so, and resolving it throws', () => {
    const charter = fromJson(
      '{"r":{"allow":["crm.*"],"deny":5},"s":{"actions":{"allow":["crm.*"],"deny":["crm.deal.delete",5]}},"muzzle":null,"t":{"allow":["crm.*"],"without":["muzzle"]}}',
    );
    expect(verifyCharter(charter, { actions: crm, data: [] }).errors).toEqual([
      { level: 'error', rule: 'shape', detail: 'role "r": "deny" is 5, which is not a list: what it takes away cannot be read' },
      { level: 'error', rule: 'shape', detail: 'role "s": "actions.deny" lists 5, which is not a string: what it takes away cannot be read' },
      { level: 'error', rule: 'shape', detail: 'role "muzzle" is null, which is not a list or an object: what it grants and takes away cannot be read' },
    ]);
    for (const role of ['r', 's', 't']) expect(() => resolvePrincipal(charter, crm, [role])).toThrow(CharterError);
    expect(verifyCharter(fromJson('{"r":{"actions":null,"allow":["crm.*"]}}'), { actions: crm, data: [] }).errors.map((error) => error.rule)).toContain('ambiguous-selection');
  });
});

describe('a role named only because every object answers to the name', () => {
  const crm = ['crm.deal.view', 'crm.deal.delete', 'admin.panel'];
  const shapeOf = (charter: Charter): string[] =>
    verifyCharter(charter, { actions: crm, data: [] }).warnings.flatMap((warning) => (warning.rule === 'shape' ? [warning.detail] : []));

  it.each([['constructor'], ['toString'], ['hasOwnProperty'], ['__proto__']])('"without" naming %s takes nothing away, as before, and is said', (name) => {
    const charter: Charter = { staff: ['*'], contractor: { extends: ['staff'], without: [name] } };
    expect(sorted(resolvePrincipal(charter, crm, ['contractor']))).toEqual([...crm].sort());
    expect(verifyCharter(charter, { actions: crm, data: [] }).errors).toEqual([]);
    expect(shapeOf(charter)).toEqual([`role "contractor": "without" names "${name}", which the charter does not define: it takes nothing away`]);
  });

  it('"extends" naming constructor adds nothing, as before, and is said', () => {
    const charter: Charter = { r: { extends: ['constructor'], allow: ['*'] } };
    expect(sorted(resolvePrincipal(charter, crm, ['r']))).toEqual([...crm].sort());
    expect(shapeOf(charter)).toEqual(['role "r": "extends" names "constructor", which the charter does not define: it adds nothing']);
  });

  it('a name nobody answers to is still an unknown role', () => {
    expect(() => resolvePrincipal({ r: { without: ['nope'] } }, crm, ['r'])).toThrow('Unknown role "nope"');
  });

  it('a role the charter does define under such a name is that role, and nothing is said', () => {
    const charter: Charter = { constructor: ['admin.panel'], r: { extends: ['constructor'] }, s: { allow: ['*'], without: ['constructor'] } };
    expect(sorted(resolvePrincipal(charter, crm, ['r']))).toEqual(['admin.panel']);
    expect(sorted(resolvePrincipal(charter, crm, ['s']))).toEqual(['crm.deal.delete', 'crm.deal.view']);
    expect(shapeOf(charter)).toEqual([]);
  });

  it('a scoping is read off a role the charter defines', () => {
    expect(resolveScoping({ r: { allow: ['*'], scoping: 'own' } }, 'toString')).toBeUndefined();
  });
});
