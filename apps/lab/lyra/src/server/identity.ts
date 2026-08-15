import type { PgPool } from '@niscorp/vex';
import type { IdentityRecord } from '@niscorp/moss';
import { evaluate } from '@niscorp/prism';
import { identityRoles } from '@lyra/app/vex/identity.entries';

// ═══════════════════════════════════════════════════════════════
// THE LICENSED READ. One statement, and this file is its whole home.
//
// A vex read runs under a compiled ScopePolicy; a policy compiles from roles;
// roles come from here. The read that resolves a principal cannot be
// authorised, because authorisation needs its answer — and NOTHING ELSE shares
// that property. Everything else a session is made of arrives through `read`,
// the capability moss lends this seam: engine reads of the seeded identity
// entries, executed as the charter's `identity` role, each pinned to the
// caller by the `identity` reach. `reads-are-vex-check` asserts the statement
// COUNT here is exactly one, and that its tables are exactly the ones the
// `identity/roles` artifact declares.
//
// This file holds no model. The model is the artifact's mapping; this file
// reads the declared facts, evaluates the declared prism, and composes.
// ═══════════════════════════════════════════════════════════════

type Read = (fingerprint: string, scope: Record<string, unknown>) => Promise<unknown>;

// NOBODY. A token that verifies for a principal this deployment cannot resolve
// lands on the lock screen — never inside the application, and never on the
// member rung, which is a working application.
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

/** `ig_<integration>@<studio>` — an integration actor names both halves in its id. */
const parseIntegrationActorId = (principal: string): { integration: string; studioId: string } | undefined => {
  if (!principal.startsWith('ig_')) return undefined;
  const rest = principal.slice('ig_'.length);
  const at = rest.indexOf('@');
  if (at < 1 || at === rest.length - 1) return undefined;
  return { integration: rest.slice(0, at), studioId: rest.slice(at + 1) };
};

/** `automation@<studio>` — a studio's robot, named by its tenant. */
const parseAutomationActorId = (principal: string): string | undefined => {
  if (!principal.startsWith('automation@')) return undefined;
  const studioId = principal.slice('automation@'.length);
  return studioId === '' ? undefined : studioId;
};

/** The engine-read half every principal shape shares: the studio's trading
 *  facts and the tenant's installs, pinned by a `studioId` that was resolved
 *  engine-side or carried in the principal's own id — never by a request. */
const readStudioAndInstalls = async (read: Read, principal: string, studioId: string): Promise<{ studio: Record<string, unknown>; installed: readonly string[] }> => {
  const scope = { userId: principal, studioId };
  const studioRaw = await read('identity/studio', scope);
  const studio = studioRaw !== null && typeof studioRaw === 'object' && !Array.isArray(studioRaw) ? (studioRaw as Record<string, unknown>) : {};
  const installedRaw = await read('identity/installed', scope);
  // FAIL CLOSED: a failed read is no integrations, never every integration.
  const installed = Array.isArray(installedRaw) ? installedRaw.map(String) : [];
  return { studio, installed };
};

export const identityFor = async (pool: PgPool, principal: string, rungOf: (actorId: string) => string | undefined, read: Read): Promise<IdentityRecord> => {
  // ── an integration acting for a tenant ── rung and studio from the id,
  // purely; the install gate through the engine. The install IS the
  // credential's lifetime: uninstalling revokes the actor, no second mechanism.
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

  // ── a studio's unattended work ── the synthetic principal tide mints for.
  // Nothing to read at all: the id names the tenant, and the chain-trust
  // comparison (`userId === automationActor`) is exact by construction.
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

  // ── a person ── three facts in; the ARTIFACT'S mapping — not this file —
  // turns them into roles, the invalidation tag, and the derived scope half.
  const result = await pool.query(ROLES, [principal]);
  const row = result.rows[0] as { staff_role: string | null; anchor_id: string | null; studio_id: string } | undefined;
  if (row === undefined) return UNRESOLVED;
  const seam = evaluate(identityRoles.mapping as never, { ...row, principal } as never) as unknown as { roles: string[]; tag: string; scope: Record<string, unknown> };
  const { studio, installed } = await readStudioAndInstalls(read, principal, seam.tag);
  const nameRaw = await read('identity/person', { userId: principal });
  const name = nameRaw !== null && typeof nameRaw === 'object' && !Array.isArray(nameRaw) ? (nameRaw as Record<string, unknown>) : {};

  // ── ME AND MINE ────────────────────────────────────────────
  //
  // The household this session reaches: the caller, then whoever they are
  // answerable for. Another engine read, pinned to the guardian by the
  // `identity` reach — no new licensed SQL, and the same shape as the install
  // list above.
  //
  // THE CALLER IS ALWAYS FIRST AND ALWAYS PRESENT, which is what makes the
  // household reach a superset of the personal one rather than a replacement
  // for it: somebody who guards nobody resolves to `[them]`, and every
  // household-reached read then answers exactly what a personal-reached one
  // would. FAIL CLOSED: a failed read is the caller alone, never everybody.
  const guardedRaw = await read('identity/guarded', { userId: principal, studioId: seam.tag });
  const guarded = Array.isArray(guardedRaw) ? (guardedRaw as { value?: unknown; can_book?: unknown }[]) : [];
  const householdIds = [principal, ...guarded.map((c) => String(c.value ?? ''))];

  // The NAMES, pinned by the ids above — a second read because the first one's
  // answer is what this one is scoped by. Skipped entirely for the common case
  // (nobody guards anybody), so a member with no children pays nothing for a
  // feature they do not use.
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
      // The SET the household reach matches on — ids only, and the only half
      // of this that reaches SQL.
      householdIds,
      // The same children as the screen says them. Never a scope value in a
      // query: `nav.family` hands this to a picker and nothing else reads it.
      household,
    },
  };
};
