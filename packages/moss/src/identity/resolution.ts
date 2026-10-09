import { createIdentityCache } from './cache';
import type { IdentityCache } from './cache';
import { memoKey } from './memo-key';
import type { IdentityRecord } from './record';

// ═══════════════════════════════════════════════════════════════
// A PRINCIPAL IS A RECORD — the second half of "who is calling", as one object
// the server builds once and asks from every surface.
//
// It is handed exactly what the answer is made of: the app's three seams (its
// identity seam, its assignments, its scope hook), a way to run a seeded entry
// as a charter role, and the cache's limits. It knows no manifest and no
// runtime, and runs no entry itself.
// ═══════════════════════════════════════════════════════════════

// WHO THIS REQUEST IS, resolved ONCE at the door.
//
// `principal` alone was never enough: every consumer downstream immediately
// asked the application three more questions to turn it into roles, scope
// values and an install list — per request, and twice per request for anything
// that compiled a policy at a reach. Resolving it here and carrying it means
// the seams are asked once per SESSION, which is the whole point of the cache
// behind them. `key` is the memo key, derived once with the record rather than
// recomputed by every lookup.
export type ResolvedIdentity = {
  roles: readonly string[];
  scope: Record<string, unknown>;
  installed: readonly string[] | undefined;
  key: string;
  // The record itself, handed back to the app's `scope` hook so a per-request
  // value can be COMPUTED from a per-session fact without a second lookup.
  // Absent when no `identity` seam is declared.
  record?: IdentityRecord;
};

// The app's identity seam (`NiscApp.identity`; ../app.ts says what it is for).
// `as` is the charter role the lent `read` executes as.
export type IdentitySeam = {
  as?: string;
  resolve: (principal: string, read: (fingerprint: string, scope: Record<string, unknown>) => Promise<unknown>) => Promise<IdentityRecord>;
};

export type IdentityConfig = {
  // The app's identity seam, when it declares one: asked once per session, and
  // its answer held.
  seam?: IdentitySeam;
  // The app's authored assignments (`NiscApp.assignments`): who somebody is
  // when there is no seam to ask.
  assignments?: Readonly<Record<string, readonly string[]>>;
  // The app's scope hook (`NiscApp.scope`): the values that follow the clock,
  // asked per request and never held.
  scope?: (principal: string | null, identity?: IdentityRecord) => Record<string, unknown>;
  // Run a seeded entry as a charter role, under these scope values: how the
  // seam's `read` reaches rows. The caller's, because running an entry under a
  // policy is not something this module does.
  readAs: (role: string, fingerprint: string, scope: Record<string, unknown>) => Promise<unknown>;
  // The cache's limits (./cache.ts): how many records, how long one may sit
  // unread, how old one may get before it is resolved again.
  max?: number;
  idleMs?: number;
  revalidateMs?: number;
};

export type Identity = {
  // One principal in, who they are out. `null` is nobody signed in.
  resolve: (principal: string | null) => Promise<ResolvedIdentity>;
  // THE SCOPE VALUES A PRINCIPAL CARRIES, from a resolution already in hand.
  composeScope: (principal: string | null, resolved: ResolvedIdentity) => Record<string, unknown>;
  // The same, for a caller that has a principal and no resolution in hand.
  scopeValuesFor: (principal: string | null) => Promise<Record<string, unknown>>;
  // Forget one principal, everybody wearing a tag, or everybody (./cache.ts).
  // With no identity seam nothing is held, and each answers as for nobody.
  invalidate: (principal: string) => boolean;
  invalidateTag: (tag: string) => readonly string[];
  invalidateAll: () => void;
  // Who is held right now and what holding them costs: structural facts for an
  // operator. Absent when the app declares no identity seam.
  roster?: Pick<IdentityCache, 'list' | 'meter'>;
  // Stop the cache's sweep.
  stop: () => void;
};

// Who somebody is by the app's authored assignments. Nobody signed in, and
// anybody the assignments do not name, is `public`.
export const assignedRoles = (assignments: Readonly<Record<string, readonly string[]>> | undefined, principal: string | null): readonly string[] =>
  principal === null ? ['public'] : (assignments?.[principal] ?? ['public']);

// ONE RESOLUTION, TWO HALVES. The app's `resolve` answers what cannot be read
// under any policy (roles, the tag, an actor's pre-auth scope). For the rest
// it is lent `read`: a seeded entry, run by the caller's engine as the charter
// role `as` names, locked to replay, with exactly the scope values the app
// passes. Every value the engine pins by was resolved engine-side; no request
// authored any of it.
const resolveThrough =
  (seam: IdentitySeam, readAs: IdentityConfig['readAs']) =>
  async (principal: string): Promise<IdentityRecord> => {
    const role = seam.as;
    const read = async (fingerprint: string, scope: Record<string, unknown>): Promise<unknown> => {
      if (role === undefined) throw new Error('moss: identity.read needs identity.as — name the charter role the reader executes as');
      return readAs(role, fingerprint, scope);
    };
    return seam.resolve(principal, read);
  };

export const createIdentity = (config: IdentityConfig): Identity => {
  const seam = config.seam;

  // IDENTITY, held by moss when the application declares the seam. Bounded,
  // evicted, revalidated on the same clock a live socket credential runs on,
  // and enumerable only by an operator. Absent, the assignments answer.
  const cache =
    seam === undefined
      ? undefined
      : createIdentityCache({ resolve: resolveThrough(seam, config.readAs), max: config.max, idleMs: config.idleMs, revalidateMs: config.revalidateMs });

  // The memo key derived ONCE per record rather than per lookup. A WeakMap
  // because the cache hands back the same object for the life of a session, and
  // because a key held here must not be the reason a record cannot be collected.
  const keys = new WeakMap<object, string>();
  const keyOf = (record: IdentityRecord): string => {
    const hit = keys.get(record);
    if (hit !== undefined) return hit;
    const key = memoKey(record.roles, record.installed);
    keys.set(record, key);
    return key;
  };

  // The older seam: the answer for an application that has not declared
  // `identity`, and for nobody signed in.
  const fromAssignments = (principal: string | null): ResolvedIdentity => {
    const roles = assignedRoles(config.assignments, principal);
    // `scope` is EMPTY here rather than the scope hook's answer, because the
    // hook is applied in `composeScope` in both cases — once, per request, over
    // whatever the record carried. Calling it here as well would ask a
    // synchronous seam twice for one answer.
    return { roles, scope: {}, installed: undefined, key: memoKey(roles, undefined) };
  };

  const resolve = async (principal: string | null): Promise<ResolvedIdentity> => {
    if (cache !== undefined && principal !== null) {
      const record = await cache.get(principal);
      return { roles: record.roles, scope: record.scope, installed: record.installed, key: keyOf(record), record };
    }
    return fromAssignments(principal);
  };

  // One spelling, used everywhere. The session's stable half from the identity
  // record, then the clock's from the `scope` hook, applied last and per
  // request. There used to be four spellings of this composition — one at the
  // vex mount and three around the integration surfaces — and a value that
  // reached one but not the others is exactly how an integration learns a
  // member's studio on one route and nothing on the next.
  const composeScope = (principal: string | null, resolved: ResolvedIdentity): Record<string, unknown> => ({
    userId: principal ?? 'anonymous',
    ...resolved.scope,
    ...(config.scope?.(principal, resolved.record) ?? {}),
  });

  return {
    resolve,
    composeScope,
    scopeValuesFor: async (principal) => composeScope(principal, await resolve(principal)),
    invalidate: (principal) => cache?.invalidate(principal) ?? false,
    invalidateTag: (tag) => cache?.invalidateTag(tag) ?? [],
    invalidateAll: () => cache?.invalidateAll(),
    ...(cache !== undefined ? { roster: { list: cache.list, meter: cache.meter } } : {}),
    stop: () => cache?.stop(),
  };
};
