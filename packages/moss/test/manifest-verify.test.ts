import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { refusalOf, verifyApp, verifyManifest } from '../src/manifest/verify';
import type { ManifestCandidate, ShippedManifest } from '../src/manifest/verify';

// ONE VERIFICATION, for boot, for a change and for a bundle that wants in. It
// reads a candidate as values, so every case here is a small object and
// nothing boots: no database, no server.
//
// It answers four things, and each has a case below: three that refuse (the
// charter, an entry's reach, the layout variants) and one that is only said
// (a chain of steps that never ends).

const home: ActionDefinition = {
  id: 'home',
  triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: 'admin.panel' } }] }],
};
const panel: ActionDefinition = { id: 'admin.panel' };
const plain: LayoutNode = { component: 'Text', children: 'plain' };

const coherent: ManifestCandidate = {
  charter: {
    public: ['home'],
    admin: { actions: ['home', 'admin.panel'], data: ['deals.read'] },
  },
  actions: { home, 'admin.panel': panel },
  layouts: {},
  wearable: [['admin']],
  grants: scopeGrants(['deals']),
  entries: [{ fingerprint: 'deals/mine', dsl: { from: ['deals'], fields: ['deals.id'] }, reach: 'own' }],
  profiles: new Set(['own', 'studio']),
};

describe('verifyManifest — may this be served', () => {
  it('a coherent candidate refuses nothing and says nothing', () => {
    const report = verifyManifest(coherent);
    expect(report.errors).toEqual([]);
    expect(report.said).toEqual([]);
    expect(refusalOf(report, 'boot')).toBeUndefined();
    expect(refusalOf(report, 'refresh')).toBeUndefined();
  });

  it('carries the charter report whole: what warns and what each role cannot reach refuse nothing', () => {
    const report = verifyManifest({ ...coherent, actions: { ...coherent.actions, stray: { id: 'stray' } } });
    expect(report.errors).toEqual([]);
    expect(report.charter.warnings.map((warning) => warning.rule)).toEqual(['orphan']);
    // `public` holds `home`, which pushes an action `public` is not granted.
    expect(report.charter.perRole.find((entry) => entry.role === 'public')?.issues.join(' ')).toContain('admin.panel');
  });

  it('refuses a charter that does not hold: a deny that matches nothing', () => {
    const report = verifyManifest({ ...coherent, charter: { ...coherent.charter, admin: { allow: ['home', 'admin.panel'], deny: ['hmoe'] } } });
    expect(report.errors.map((error) => error.check)).toEqual(['charter']);
    expect(report.errors[0]?.detail).toMatch(/^dead-deny: role "admin" denies "hmoe"/);
  });

  it('refuses an entry whose reach names a profile no table offers, and says which exist', () => {
    const report = verifyManifest({ ...coherent, profiles: new Set(['studio']) });
    expect(report.errors).toEqual([
      { check: 'reach', detail: 'deals/mine declares reach "own"' },
      { check: 'reach', detail: 'known profiles: studio' },
    ]);
    // ...and an entry that names no reach is served at the caller's own.
    expect(verifyManifest({ ...coherent, entries: [{ fingerprint: 'deals/all', dsl: { from: ['deals'], fields: ['deals.id'] } }], profiles: new Set() }).errors).toEqual([]);
  });

  it('refuses layout variants no principal could be served', () => {
    const ghost = verifyManifest({ ...coherent, layouts: { 'ghost.dense': { action: 'ghost', layout: plain } } });
    expect(ghost.errors).toEqual([{ check: 'variants', detail: 'layout variant "ghost.dense" reshapes unknown action "ghost"' }]);

    const two = verifyManifest({
      ...coherent,
      charter: { ...coherent.charter, admin: { actions: ['home', 'admin.panel'], layouts: ['home.*'] } },
      layouts: { 'home.dense': { action: 'home', layout: plain }, 'home.wide': { action: 'home', layout: plain } },
    });
    expect(two.errors.map((error) => error.check)).toEqual(['variants', 'variants']);
    expect(two.errors[0]?.detail).toContain('role "admin" holds 2 variants of "home"');
    // The combination a principal may hold is named beside the role alone.
    expect(two.errors[1]?.detail).toContain('the combination [admin]');
  });

  it('says a chain of steps that never ends, and still serves', () => {
    const loop: ActionDefinition = { id: 'loop', triggers: [{ message: 'x', do: [{ emit: { channel: 'x' } }] }] };
    const report = verifyManifest({ ...coherent, charter: { ...coherent.charter, public: ['home', 'loop'] }, actions: { ...coherent.actions, loop } });
    expect(report.errors).toEqual([]);
    expect(report.said).toEqual(['a chain of steps that never ends: x —emit (loop)→ x — nova stops it at its budget when it runs (RUNAWAY_CHAIN)']);
  });

  // What a set of actions holds when it comes from rows or over a wire and no
  // schema has read it: the compiler is told it is an action, and it is not.
  const unread = (text: string): ActionDefinition => JSON.parse(text);

  it('refuses a definition nova does not read, naming the action and what is wrong with it', () => {
    const typo = unread('{"id":"admin.panel","tittle":"A typo"}');
    const noTriggers = unread('{"id":"home","triggers":"none"}');
    const report = verifyManifest({ ...coherent, actions: { home: noTriggers, 'admin.panel': typo } });
    expect(report.errors.filter((error) => error.check === 'actions')).toEqual([
      { check: 'actions', detail: expect.stringMatching(/^"home" is not an action nova reads: triggers: /) },
      { check: 'actions', detail: '"admin.panel" is not an action nova reads: (root): Unrecognized key: "tittle"' },
    ]);
    // Found before the charter is asked about them, and said first.
    expect(report.errors[0]?.check).toBe('actions');
    expect(refusalOf(report, 'boot')).toMatch(/^Actions are not ones nova reads — refusing to serve:\n {2}"home" is not an action nova reads: triggers: /);
    expect(refusalOf(report, 'refresh')).toMatch(/^Refresh refused — actions nova does not read:\n {2}"home" is not an action nova reads/);
  });

  it('a definition nested too deep to be read is refused the same way, and nothing throws', () => {
    const deep = unread(`{"id":"home","layout":${'{"component":"Stack","children":['.repeat(5000)}"x"${']}'.repeat(5000)}}`);
    const report = verifyManifest({ ...coherent, actions: { ...coherent.actions, home: deep } });
    expect(report.errors[0]).toEqual({ check: 'actions', detail: expect.stringMatching(/^"home" is not an action nova reads: /) });
  });
});

describe('verifyApp — the check boot runs, for an app that is not booted', () => {
  // What an app hands over, as the app writes it: the role combinations are
  // in its assignments and the profiles in its behaviors, and the candidate is
  // built from them.
  const app: ShippedManifest = {
    charter: { public: ['home'], admin: { actions: ['home', 'admin.panel'], data: ['deals.read'], layouts: ['home.*'] }, auditor: { actions: ['home'], layouts: ['home.wide'] } },
    assignments: { usr_1: ['admin'], usr_2: ['auditor'] },
    actions: { home, 'admin.panel': panel },
    layouts: { 'home.dense': { action: 'home', layout: plain } },
    behaviors: { deals: { own: { read: [{ match: 'owner_id', to: 'userId' }] }, default: {} } },
    entries: [{ fingerprint: 'deals/mine', dsl: { from: ['deals'], fields: ['deals.id'] }, reach: 'own' }],
  };
  const grants = scopeGrants(['deals']);

  it('answers what a boot of that app would: nothing refuses, and the charter report rides along', () => {
    const report = verifyApp(app, grants);
    expect(report.errors).toEqual([]);
    expect(report.charter.perRole.map((entry) => entry.role)).toEqual(['public', 'admin', 'auditor']);
    expect(report.charter.warnings.map((warning) => warning.rule)).toEqual(['dead-allow']);
  });

  it('refuses what a boot refuses, each under the check that found it', () => {
    // A reach no behavior declares.
    expect(verifyApp({ ...app, behaviors: {} }, grants).errors).toEqual([
      { check: 'reach', detail: 'deals/mine declares reach "own"' },
      { check: 'reach', detail: 'known profiles: (none)' },
    ]);
    // A deny over a table the database does not carry protects nothing.
    const denies = { ...app, charter: { ...app.charter, auditor: { actions: ['home'], layouts: ['home.wide'], data: { allow: ['*.read'], deny: ['deals.read'] } } } };
    expect(verifyApp(denies, grants).errors).toEqual([]);
    expect(verifyApp(denies, scopeGrants(['leads'])).errors.map((error) => `${error.check} ${error.detail.split(':')[0]}`)).toEqual(['charter dead-deny']);
    // Two variants of one action on somebody the assignments name: one role
    // alone holds one each, the two together hold both.
    const both = verifyApp({ ...app, layouts: { ...app.layouts, 'home.wide': { action: 'home', layout: plain } }, assignments: { usr_1: ['admin', 'auditor'] } }, grants);
    expect(both.errors.map((error) => error.check)).toContain('variants');
    expect(both.errors.find((error) => error.detail.includes('the combination [admin, auditor]'))?.detail).toContain('holds 2 variants of "home"');
  });
});

describe('refusalOf — the sentence a refusal is thrown with', () => {
  const broken: ManifestCandidate = {
    ...coherent,
    charter: { ...coherent.charter, admin: { allow: ['home', 'admin.panel'], deny: ['hmoe'] } },
    layouts: { 'ghost.dense': { action: 'ghost', layout: plain } },
    profiles: new Set(),
  };

  it('a boot says it serves nothing; a change says it was refused', () => {
    const report = verifyManifest(broken);
    expect(refusalOf(report, 'boot')).toBe(
      'Charter is incoherent — refusing to serve:\n  dead-deny: role "admin" denies "hmoe" (actions) which matches nothing — silent means unprotected',
    );
    expect(refusalOf(report, 'refresh')).toBe(
      'Refresh refused — charter incoherent over the new artifacts:\n  dead-deny: role "admin" denies "hmoe" (actions) which matches nothing — silent means unprotected',
    );
  });

  it('names one check at a time, the first that failed', () => {
    const report = verifyManifest(broken);
    expect([...new Set(report.errors.map((error) => error.check))]).toEqual(['charter', 'reach', 'variants']);
    expect(refusalOf(report, 'boot')).not.toContain('reach');

    const reach = verifyManifest({ ...broken, charter: coherent.charter });
    expect(refusalOf(reach, 'boot')).toBe('Entries declare a reach no table offers — refusing to serve:\n  deals/mine declares reach "own"\n  known profiles: (none)');
    expect(refusalOf(reach, 'refresh')).toBe('Refresh refused — entries declare a reach no table offers:\n  deals/mine declares reach "own"\n  known profiles: (none)');

    const variants = verifyManifest({ ...coherent, layouts: broken.layouts });
    expect(refusalOf(variants, 'boot')).toBe('Layout variants are incoherent — refusing to serve:\n  layout variant "ghost.dense" reshapes unknown action "ghost"');
    expect(refusalOf(variants, 'refresh')).toBe('Refresh refused — layout variants incoherent:\n  layout variant "ghost.dense" reshapes unknown action "ghost"');
  });
});
