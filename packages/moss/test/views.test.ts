import { describe, it, expect, vi } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { ScopeBehaviors } from '@niscorp/vex';
import { createRunningManifest } from '../src/artifactory';
import { manifestMisfits } from '../src/manifest/schema';
import { verifyManifest, candidateOf } from '../src/manifest/verify';
import type { ShippedManifest, ViewReads } from '../src/manifest';

const GRANTS = [...scopeGrants(['class_sessions', 'teachers']), 'public_sessions.read'];
const PUBLIC_SESSIONS: ViewReads = { name: 'public_sessions', reads: ['class_sessions', 'teachers'] };

const site = (more: Partial<ShippedManifest> = {}): ShippedManifest => ({
  charter: { public: { actions: [], data: ['public_sessions.read'] }, staff: { actions: [], data: ['class_sessions.read', 'teachers.read'] } },
  actions: {},
  entries: [],
  ...more,
});

const saidAtBoot = (shipped: ShippedManifest, views: readonly ViewReads[] = [PUBLIC_SESSIONS], grants: readonly string[] = GRANTS): string[] => {
  const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    createRunningManifest({ shipped, grants, views, shells: [] });
    return said.mock.calls.map((call) => String(call[0]));
  } finally {
    said.mockRestore();
  }
};

describe('an app’s views, in the manifest and the charter', () => {
  it('`views` is a list of names in the manifest, and absent is fine', () => {
    expect(manifestMisfits({ charter: { public: [] }, actions: {} })).toEqual([]);
    expect(manifestMisfits({ charter: { public: [] }, actions: {}, views: ['public_sessions'] })).toEqual([]);
    expect(manifestMisfits({ charter: { public: [] }, actions: {}, views: 'public_sessions' })).not.toEqual([]);
  });

  it('a write grant naming a view matches nothing, and the charter says so; a deny naming one refuses', () => {
    const allowing = verifyManifest(candidateOf(site({ charter: { public: { actions: [], data: ['public_sessions.read', 'public_sessions.write.insert'] } } }), { actions: {}, entries: [] }, GRANTS));
    expect(allowing.charter.warnings.map((warning) => warning.detail)).toContain('role "public" allows "public_sessions.write.insert" (data) which matches nothing');
    const denying = verifyManifest(candidateOf(site({ charter: { public: { actions: [], data: { allow: ['public_sessions.read'], deny: ['public_sessions.write.*'] } } } }), { actions: {}, entries: [] }, GRANTS));
    expect(denying.charter.errors.map((error) => error.rule)).toContain('dead-deny');
  });
});

describe('what the boot says of a view', () => {
  it('a role granted a view and not a table under it is said, once for each table', () => {
    expect(saidAtBoot(site())).toEqual([
      '[moss] public reads public_sessions, a view over class_sessions, which it is not granted.',
      '[moss] public reads public_sessions, a view over teachers, which it is not granted.',
    ]);
  });

  it('a role that reads a table under row rules and a view over it without any is said, by the role’s own policy', () => {
    const studioOnly: ScopeBehaviors = { class_sessions: { read: [{ match: 'studio', to: 'studio' }] } };
    const staff = { actions: [], data: ['class_sessions.read', 'teachers.read', 'public_sessions.read'] };
    const widened = '[moss] staff reads public_sessions, a view over class_sessions, without the row rules it reads class_sessions under.';
    expect(saidAtBoot(site({ charter: { public: [], staff }, behaviors: studioOnly }))).toEqual([widened]);
    const viewRuled: ScopeBehaviors = { ...studioOnly, public_sessions: { read: [{ match: 'studio', to: 'studio' }] } };
    expect(saidAtBoot(site({ charter: { public: [], staff }, behaviors: viewRuled }))).toEqual([]);
    const writesOnly: ScopeBehaviors = { class_sessions: { write: [{ match: 'studio', to: 'studio' }] } };
    expect(saidAtBoot(site({ charter: { public: [], staff }, behaviors: writesOnly }))).toEqual([]);
  });

  it('profiles are read as the role is scoped: a profile that reads every row says nothing, a view whose profile does says it', () => {
    const admin = { actions: [], data: ['class_sessions.read', 'teachers.read', 'public_sessions.read'], scoping: 'admin' };
    const staff = { actions: [], data: ['class_sessions.read', 'teachers.read', 'public_sessions.read'] };
    const byProfile: ScopeBehaviors = { class_sessions: { default: { read: [{ match: 'studio', to: 'studio' }] }, admin: { read: [] } } };
    expect(saidAtBoot(site({ charter: { public: [], admin, staff }, behaviors: byProfile }))).toEqual([
      '[moss] staff reads public_sessions, a view over class_sessions, without the row rules it reads class_sessions under.',
    ]);
    const viewByProfile: ScopeBehaviors = { ...byProfile, public_sessions: { default: {}, admin: { read: [{ match: 'studio', to: 'studio' }] } } };
    expect(saidAtBoot(site({ charter: { public: [], admin, staff }, behaviors: viewByProfile }))).toEqual([
      '[moss] staff reads public_sessions, a view over class_sessions, without the row rules it reads class_sessions under.',
    ]);
    const onlyProfiled: ScopeBehaviors = { class_sessions: { admin: { read: [] } } };
    expect(saidAtBoot(site({ charter: { public: [], admin, staff }, behaviors: onlyProfiled }))).toEqual([
      '[moss] staff reads public_sessions, a view over class_sessions, which it is not granted.',
    ]);
  });

  it('moss’s own row rules count: a view over what was saved is said for a role that reads it', () => {
    const saved: ViewReads = { name: 'saved_names', reads: ['artifacts'] };
    const member = { actions: [], data: ['artifacts.read', 'saved_names.read'] };
    expect(saidAtBoot(site({ charter: { public: [], member } }), [saved], [...scopeGrants(['artifacts']), 'saved_names.read'])).toEqual([
      '[moss] member reads saved_names, a view over artifacts, without the row rules it reads artifacts under.',
    ]);
  });

  it('nothing is said of views where the app lists none, or no role is granted one', () => {
    expect(saidAtBoot(site(), [])).toEqual([]);
    expect(saidAtBoot(site({ charter: { public: [], staff: { actions: [], data: ['class_sessions.read'] } } }))).toEqual([]);
  });
});
