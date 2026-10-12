import type { PgPool } from '@niscorp/vex';
import type { IdentityRecord } from '@niscorp/moss';
import { evaluate } from '@niscorp/prism';
import { identityRoles } from '@lyra/app/vex/identity.entries';

// `ROLES` is the one statement that does not go through the engine: a vex read
// runs under a policy compiled from roles, and roles come from here. Everything
// else arrives through `read`, as the charter's `identity` role.

type Read = (fingerprint: string, scope: Record<string, unknown>) => Promise<unknown>;

// A token that verifies for a principal this deployment cannot resolve lands on
// the lock screen, never on the member rung, which is a working application.
const UNRESOLVED: IdentityRecord = { roles: ['public'], scope: {}, installed: [] };

const ROLES = /* sql */ `
  SELECT
    sf.role AS staff_role,
    sp.id   AS anchor_id,
    COALESCE(sf.studio_id, sp.studio_id) AS studio_id
  FROM people p
  LEFT JOIN staff sf         ON sf.person_id = p.id AND sf.active
  LEFT JOIN studio_people sp ON sp.person_id = p.id
  WHERE p.id = $1 AND COALESCE(sf.studio_id, sp.studio_id) IS NOT NULL
  -- Oldest anchor first: somebody known to two studios resolves to the one
  -- that has known them longest, deterministically (D6's holding position).
  ORDER BY sp.first_seen_on DESC NULLS LAST
  LIMIT 1
`;

const parseIntegrationActorId = (principal: string): { integration: string; studioId: string } | undefined => {
  if (!principal.startsWith('ig_')) return undefined;
  const rest = principal.slice('ig_'.length);
  const at = rest.indexOf('@');
  if (at < 1 || at === rest.length - 1) return undefined;
  return { integration: rest.slice(0, at), studioId: rest.slice(at + 1) };
};

const parseAutomationActorId = (principal: string): string | undefined => {
  if (!principal.startsWith('automation@')) return undefined;
  const studioId = principal.slice('automation@'.length);
  return studioId === '' ? undefined : studioId;
};

/** `studioId` is resolved engine-side or carried in the principal's own id,
 *  never taken from a request. */
const readStudioAndInstalls = async (read: Read, principal: string, studioId: string): Promise<{ studio: Record<string, unknown>; installed: readonly string[] }> => {
  const scope = { userId: principal, studioId };
  const studioRaw = await read('identity/studio', scope);
  const studio = studioRaw !== null && typeof studioRaw === 'object' && !Array.isArray(studioRaw) ? (studioRaw as Record<string, unknown>) : {};
  const installedRaw = await read('identity/installed', scope);
  const installed = Array.isArray(installedRaw) ? installedRaw.map(String) : [];
  return { studio, installed };
};

export const identityFor = async (pool: PgPool, principal: string, rungOf: (actorId: string) => string | undefined, read: Read): Promise<IdentityRecord> => {
  const actor = parseIntegrationActorId(principal);
  if (actor !== undefined) {
    const { studio, installed } = await readStudioAndInstalls(read, principal, actor.studioId);
    if (!installed.includes(actor.integration)) return UNRESOLVED;
    return {
      roles: [rungOf(principal) ?? 'integration'],
      installed,
      tag: actor.studioId,
      scope: {
        studioId: actor.studioId,
        // No personId: an actor is not somebody the studio knows, which is
        // what an integration's "only a member can pay" check keys on.
        personId: '',
        name: `${actor.integration} (integration)`,
        audience: 'integration',
        trains: false,
        automationActor: `automation@${actor.studioId}`,
        ...studio,
      },
    };
  }

  const automationStudioId = parseAutomationActorId(principal);
  if (automationStudioId !== undefined) {
    const { studio, installed } = await readStudioAndInstalls(read, principal, automationStudioId);
    if (Object.keys(studio).length === 0) return UNRESOLVED;
    return {
      roles: ['automation'],
      installed,
      tag: automationStudioId,
      scope: {
        studioId: automationStudioId,
        personId: '',
        name: 'Automations',
        audience: 'automation',
        trains: false,
        automationActor: principal,
        ...studio,
      },
    };
  }

  const result = await pool.query(ROLES, [principal]);
  const row = result.rows[0] as { staff_role: string | null; anchor_id: string | null; studio_id: string } | undefined;
  if (row === undefined) return UNRESOLVED;
  const seam = evaluate(identityRoles.mapping as never, { ...row, principal } as never) as unknown as { roles: string[]; tag: string; scope: Record<string, unknown> };
  const { studio, installed } = await readStudioAndInstalls(read, principal, seam.tag);
  const nameRaw = await read('identity/person', { userId: principal });
  const name = nameRaw !== null && typeof nameRaw === 'object' && !Array.isArray(nameRaw) ? (nameRaw as Record<string, unknown>) : {};

  // The caller is always in `householdIds`, so the household reach is a superset
  // of the personal one. A failed read is the caller alone, never everybody.
  const guardedRaw = await read('identity/guarded', { userId: principal, studioId: seam.tag });
  const guarded = Array.isArray(guardedRaw) ? (guardedRaw as { value?: unknown; can_book?: unknown }[]) : [];
  const householdIds = [principal, ...guarded.map((c) => String(c.value ?? ''))];

  const namesRaw = guarded.length === 0 ? [] : await read('identity/household', { userId: principal, studioId: seam.tag, householdIds });
  const names = new Map((Array.isArray(namesRaw) ? (namesRaw as { value?: unknown; label?: unknown }[]) : []).map((n) => [String(n.value ?? ''), String(n.label ?? '')]));
  const household = guarded.map((c) => ({ value: String(c.value ?? ''), label: names.get(String(c.value ?? '')) ?? '', can_book: c.can_book === true }));

  return {
    roles: seam.roles,
    tag: seam.tag,
    installed,
    scope: {
      ...seam.scope,
      ...name,
      ...studio,
      householdIds,
      household,
    },
  };
};
