import { describe, it, expect } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { refusalOf, verifyApp, verifyManifest } from '../src/manifest/verify';
import type { ManifestCandidate, ShippedManifest } from '../src/manifest/verify';

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
  fragmentIds: new Set(),
  fragmentCalls: [],
  wearable: [['admin']],
  grants: scopeGrants(['deals']),
  entries: [{ fingerprint: 'deals/mine', dsl: { from: ['deals'], fields: ['deals.id'] }, reach: 'own' }],
  profiles: new Set(['own', 'studio']),
};

const naming = (ref: string): ActionDefinition => ({ id: 'panel', layout: { component: 'Stack', children: [{ component: 'Button', ref: 'action/pressed' }, { ref }] } });

describe('verifyManifest — a name under which moss keeps a layout is nobody’s to write', () => {
  const shipped = (panel: ActionDefinition, more: Partial<ShippedManifest> = {}): ShippedManifest => ({ charter: { public: ['home', 'panel'] }, actions: { home: { id: 'home' }, panel }, ...more });

  it('an action whose layout names one, its own or another’s, is not one that may be served', () => {
    const errors = (panel: ActionDefinition): string[] => verifyApp(shipped(panel), []).errors.map((error) => `${error.check}: ${error.detail}`);
    expect(errors(naming('action/panel'))).toEqual(['actions: "panel" names the layout "action/panel": a name beginning with "action/" is where the layout of that action is kept']);
    expect(errors(naming('action/home'))).toEqual(['actions: "panel" names the layout "action/home": a name beginning with "action/" is where the layout of that action is kept']);
    expect(errors({ id: 'panel', layout: 'action/home' })).toEqual(['actions: "panel" names the layout "action/home": a name beginning with "action/" is where the layout of that action is kept']);
    expect(errors(naming('frame'))).toEqual(['actions: "panel" names the layout "frame": "frame" is where the layout of the shell is kept']);
    expect(errors(naming('canvas/main'))).toEqual(['actions: "panel" names the layout "canvas/main": a name beginning with "canvas/" is where the layout of that canvas is kept']);
    expect(errors(naming('dock'))).toEqual([]);
    expect(errors(naming('frame.dock'))).toEqual([]);
  });

  it('a `ref` a component keeps in its props, and a node’s own, names no layout', () => {
    const panel: ActionDefinition = {
      id: 'panel',
      layout: { component: 'Tabs', ref: 'frame', props: { tabs: [{ label: 'Frame', ref: 'frame' }, { ref: 'canvas/main' }], anchor: { ref: 'action/home' } }, children: [{ ref: 'dock' }] },
    };
    expect(verifyApp(shipped(panel), []).errors).toEqual([]);
  });

  it('nor is a layout variant that names one', () => {
    const report = verifyApp(shipped({ id: 'panel' }, { charter: { public: { actions: ['home', 'panel'], layouts: ['panel.wide'] } }, layouts: { 'panel.wide': { action: 'panel', layout: { ref: 'action/home' } } } }), []);
    expect(report.errors.map((error) => `${error.check}: ${error.detail}`)).toEqual([
      'variants: layout variant "panel.wide" names the layout "action/home": a name beginning with "action/" is where the layout of that action is kept',
    ]);
  });
});

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
    expect(two.errors[1]?.detail).toContain('the combination [admin]');
  });

  it('says a chain of steps that never ends, and still serves', () => {
    const loop: ActionDefinition = { id: 'loop', triggers: [{ message: 'x', do: [{ emit: { channel: 'x' } }] }] };
    const report = verifyManifest({ ...coherent, charter: { ...coherent.charter, public: ['home', 'loop'] }, actions: { ...coherent.actions, loop } });
    expect(report.errors).toEqual([]);
    expect(report.said).toEqual(['a chain of steps that never ends: x —emit (loop)→ x — nova stops it at its budget when it runs (RUNAWAY_CHAIN)']);
  });

  const unread = (text: string): ActionDefinition => JSON.parse(text);

  it('refuses a definition nova does not read, naming the action and what is wrong with it', () => {
    const typo = unread('{"id":"admin.panel","tittle":"A typo"}');
    const noTriggers = unread('{"id":"home","triggers":"none"}');
    const report = verifyManifest({ ...coherent, actions: { home: noTriggers, 'admin.panel': typo } });
    expect(report.errors.filter((error) => error.check === 'actions')).toEqual([
      { check: 'actions', detail: expect.stringMatching(/^"home" is not an action nova reads: triggers: /) },
      { check: 'actions', detail: '"admin.panel" is not an action nova reads: (root): Unrecognized key: "tittle"' },
    ]);
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

describe('verifyManifest — a function an action calls is one its holder’s roles grant', () => {
  const closing: ActionDefinition = { id: 'deals.close', endpoints: { close: { fn: 'deals.close' } } };
  const exporting: ActionDefinition = { id: 'deals.export', endpoints: { run: { fn: 'deals.export' } } };
  const errorsOf = (app: ShippedManifest): string[] => verifyApp(app, []).errors.filter((error) => error.check === 'functions').map((error) => error.detail);
  const app = (charter: ShippedManifest['charter'], more: Partial<ShippedManifest> = {}): ShippedManifest => ({
    charter,
    actions: { 'deals.close': closing, 'deals.export': exporting },
    wearable: [['member'], ['member', 'auditor']],
    ...more,
  });

  it('refuses the boot, and lists per combination of roles somebody wears each call their functions do not grant', () => {
    expect(errorsOf(app({ member: { actions: ['deals.*'], functions: ['deals.export'] }, auditor: { actions: [] } }))).toEqual([
      '"member" hold "deals.close", which calls "deals.close": their functions do not grant it',
      '"member", "auditor" hold "deals.close", which calls "deals.close": their functions do not grant it',
    ]);
  });

  it('a call one role of a combination grants is granted to the combination, and each role is checked on its own too, as the variant check reads it', () => {
    expect(errorsOf(app({ member: { actions: ['deals.*'], functions: ['deals.export'] }, auditor: { actions: [], functions: ['deals.close'] } }, { wearable: [['member', 'auditor']] }))).toEqual([
      '"member" hold "deals.close", which calls "deals.close": their functions do not grant it',
    ]);
  });

  it('a function whose name is worked out when it is called, from the action’s data, is not read at boot: the shell’s map decides', () => {
    const saving: ActionDefinition = { id: 'deals.save', data: { saveFn: 'deals.export' }, endpoints: { save: { fn: '{{$.saveFn}}' } } };
    expect(errorsOf(app({ member: { actions: ['deals.*'], functions: ['deals.*'] } }, { wearable: [['member']], actions: { 'deals.save': saving } }))).toEqual([]);
  });

  it('two shells that ship a fragment under one id are each read', () => {
    const sheet = (fn: string) => ({ kind: 'fragment' as const, id: 'sheet', layout: { slot: 'body' }, endpoints: { close: { fn } } });
    expect(
      errorsOf(app({ member: { actions: ['deals.export'], functions: ['deals.export'] } }, {
        wearable: [['member']],
        shell: { canvases: [], fragments: { sheet: sheet('a.close') } },
        pages: { about: { path: '/about', canvases: [], fragments: { sheet: sheet('b.close') } } },
      })),
    ).toEqual([
      '"member" hold the fragment "sheet", which any of them may wear, which calls "a.close": their functions do not grant it',
      '"member" hold the fragment "sheet", which any of them may wear, which calls "b.close": their functions do not grant it',
    ]);
  });

  it('a glob grants as it does for the other sections, and `*` allows every function, which is said', () => {
    expect(errorsOf(app({ member: { actions: ['deals.*'], functions: ['deals.*'] }, auditor: { actions: [] } }))).toEqual([]);
    const report = verifyApp(app({ member: { actions: ['deals.*'], functions: ['*'] }, auditor: { actions: [] } }), []);
    expect(report.errors).toEqual([]);
    expect(report.said).toContain(`role "member" allows every function ('*'): the generated actions of the people who hold it, or a role that extends it, may call any it does not deny`);
  });

  it('the roles somebody nobody assigned holds are checked too: `public`', () => {
    expect(errorsOf(app({ public: ['deals.export'], member: { actions: ['deals.*'], functions: ['deals.*'] } }, { wearable: [['member']] }))).toEqual([
      '"public" hold "deals.export", which calls "deals.export": their functions do not grant it',
    ]);
  });

  it('a fragment a shell ships may be worn by any action, so its calls are held to every combination that holds one', () => {
    const shell = { canvases: [], fragments: { sheet: { kind: 'fragment' as const, id: 'sheet', layout: { slot: 'body' }, endpoints: { close: { fn: 'sheet.close' } } } } };
    expect(errorsOf(app({ member: { actions: ['deals.export'], functions: ['deals.export'] } }, { wearable: [['member']], shell }))).toEqual([
      '"member" hold the fragment "sheet", which any of them may wear, which calls "sheet.close": their functions do not grant it',
    ]);
  });
});

describe('verifyApp — the check boot runs, for an app that is not booted', () => {
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
    expect(verifyApp({ ...app, behaviors: {} }, grants).errors).toEqual([
      { check: 'reach', detail: 'deals/mine declares reach "own"' },
      { check: 'reach', detail: 'known profiles: (none)' },
    ]);
    const denies = { ...app, charter: { ...app.charter, auditor: { actions: ['home'], layouts: ['home.wide'], data: { allow: ['*.read'], deny: ['deals.read'] } } } };
    expect(verifyApp(denies, grants).errors).toEqual([]);
    expect(verifyApp(denies, scopeGrants(['leads'])).errors.map((error) => `${error.check} ${error.detail.split(':')[0]}`)).toEqual(['charter dead-deny']);
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
