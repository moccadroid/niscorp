import { z } from 'zod';
import { createIdentityCache, memoKey } from './cache';
import type { IdentityCache, IdentityRecord } from './cache';

export type ResolvedIdentity = {
  roles: readonly string[];
  scope: Record<string, unknown>;
  installed: readonly string[] | undefined;
  key: string;
  record?: IdentityRecord;
};

export type IdentitySeam = {
  as?: string;
  resolve: (principal: string, read: (fingerprint: string, scope: Record<string, unknown>) => Promise<unknown>) => Promise<IdentityRecord>;
};

export type IdentityConfig = {
  seam?: IdentitySeam;
  assignments?: Readonly<Record<string, readonly string[]>>;
  scope?: (principal: string | null, identity?: IdentityRecord) => Record<string, unknown>;
  readAs: (role: string, fingerprint: string, scope: Record<string, unknown>) => Promise<unknown>;
  max?: number;
  idleMs?: number;
  revalidateMs?: number;
};

export type Identity = {
  resolve: (principal: string | null) => Promise<ResolvedIdentity>;
  composeScope: (principal: string | null, resolved: ResolvedIdentity) => Record<string, unknown>;
  scopeValuesFor: (principal: string | null) => Promise<Record<string, unknown>>;
  invalidate: (principal: string) => boolean;
  invalidateTag: (tag: string) => readonly string[];
  invalidateAll: () => void;
  roster?: Pick<IdentityCache, 'list' | 'meter'>;
  stop: () => void;
};

export const assignedRoles = (assignments: Readonly<Record<string, readonly string[]>> | undefined, principal: string | null): readonly string[] =>
  principal === null ? ['public'] : (assignments?.[principal] ?? ['public']);

// Loose on purpose: the record goes back to the app's own scope hook, which
// may read fields of its own on it.
const IdentityRecordSchema = z.looseObject({
  roles: z.array(z.string()),
  scope: z.record(z.string(), z.unknown()),
  installed: z.array(z.string()).optional(),
  tag: z.string().optional(),
});

// Names the field and what was expected there, never what the record held:
// that is somebody's roles and tenant.
const recordRefusal = (issues: readonly z.core.$ZodIssue[]): Error =>
  new Error(
    `moss: \`identity.resolve\` did not answer an identity record (${issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')}). ` +
      'A record is { roles: string[], scope: {…}, installed?: string[], tag?: string }.',
  );

const resolveThrough =
  (seam: IdentitySeam, readAs: IdentityConfig['readAs']) =>
  async (principal: string): Promise<IdentityRecord> => {
    const role = seam.as;
    const read = async (fingerprint: string, scope: Record<string, unknown>): Promise<unknown> => {
      if (role === undefined) throw new Error('moss: identity.read needs identity.as — name the charter role the reader executes as');
      return readAs(role, fingerprint, scope);
    };
    const answered = IdentityRecordSchema.safeParse(await seam.resolve(principal, read));
    if (!answered.success) throw recordRefusal(answered.error.issues);
    return answered.data;
  };

export const createIdentity = (config: IdentityConfig): Identity => {
  const seam = config.seam;

  const cache =
    seam === undefined
      ? undefined
      : createIdentityCache({ resolve: resolveThrough(seam, config.readAs), max: config.max, idleMs: config.idleMs, revalidateMs: config.revalidateMs });

  const keys = new WeakMap<object, string>();
  const keyOf = (record: IdentityRecord): string => {
    const hit = keys.get(record);
    if (hit !== undefined) return hit;
    const key = memoKey(record.roles, record.installed);
    keys.set(record, key);
    return key;
  };

  const fromAssignments = (principal: string | null): ResolvedIdentity => {
    const roles = assignedRoles(config.assignments, principal);
    // The scope is empty on purpose: `composeScope` applies the scope hook.
    return { roles, scope: {}, installed: undefined, key: memoKey(roles, undefined) };
  };

  const resolve = async (principal: string | null): Promise<ResolvedIdentity> => {
    if (cache !== undefined && principal !== null) {
      const record = await cache.get(principal);
      return { roles: record.roles, scope: record.scope, installed: record.installed, key: keyOf(record), record };
    }
    return fromAssignments(principal);
  };

  // The scope hook is applied last and for each request, never held with the
  // record: its values may follow the clock.
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
