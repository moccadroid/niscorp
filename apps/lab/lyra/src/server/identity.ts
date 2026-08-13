import type { PgPool } from '@niscorp/vex';
import type { IdentityRecord } from '@niscorp/moss';
export type Audience = 'owner' | 'manager' | 'instructor' | 'desk' | 'member' | 'automation' | 'integration';

const AUDIENCE_OF: Record<string, Audience> = { owner: 'owner', manager: 'manager', instructor: 'instructor', desk: 'desk', automation: 'automation' };

/** A staff role as the charter's audience. Anything unrecognised lands on the
 *  bottom rung — the charter THROWS on a role it does not know, so resolving
 *  downward has to happen here, before it ever sees one. */
export const audienceOf = (role: string): Audience => AUDIENCE_OF[role] ?? 'member';

/** EVERY role a person holds, not one. The schema splits `staff` and
 *  `studio_people` because a person can be both at a studio; flattening them to
 *  a single word is what makes an instructor who trains stop being a member the
 *  moment the charter looks at them. */
export const rolesOf = (person: { audience: string; studioPersonId: string | null }): readonly string[] => {
  const roles: string[] = [];
  if (person.audience !== 'member') roles.push(person.audience);
  if (person.studioPersonId !== null) roles.push('member');
  return roles.length > 0 ? roles : ['member'];
};

// ═══════════════════════════════════════════════════════════════
// WHO ONE PRINCIPAL IS — one row, on demand, for whoever presented a token.
//
// This is the ONE query in the application that does not pass through the
// engine, and the reason is structural rather than convenient: a vex read needs
// a compiled ScopePolicy, a policy compiles from roles, and roles come from
// here. The read that resolves a principal cannot be authorised, because
// authorisation needs its answer. Every system has this.
//
// What that licenses is exactly this: `principal -> { roles, scope values }`,
// for the ONE principal asking. It does not license a resident copy of the
// population — that was never a decision anybody made, it was the only thing a
// synchronous signature could be implemented with (docs/plans/lyra-identity.md,
// Part 1). The seam is async now, so the obvious implementation is available:
// read the row.
//
// Move 2 replaces the SQL below with a manifest-declared vex entry executed
// under a bootstrap policy, which is what makes identity an artifact the checks
// can read. That needs D4 answered first. The shape of the answer does not
// change when it lands — only where the question is written down.
// ═══════════════════════════════════════════════════════════════

type Row = {
  id: string;
  name: string;
  studio_id: string;
  studio_name: string;
  timezone: string;
  country: string;
  locale: string;
  currency: string;
  staff_role: string | null;
  studio_person_id: string | null;
  installed: string[] | null;
};

// The studio half of every principal's scope values. Shared by the person path
// and the integration-actor path below, because a pack acting for a studio
// trades in the same currency and reads in the same language as the people
// there — and two spellings of that would be two answers.
const studioScope = (row: Pick<Row, 'studio_id' | 'timezone' | 'country' | 'locale' | 'currency'>): Record<string, unknown> => ({
  studioId: row.studio_id,
  // Travels in the assertion, so an installed pack learns where a studio trades
  // without asking it and without a country ever being sent by a browser.
  country: row.country,
  // Read by every vex mapping that renders a date or an amount. Engine-side, so
  // a browser cannot ask to be shown a different studio's money in its own
  // language.
  locale: row.locale,
  // Beside `locale` for the same reason it exists: an amount is a number AND a
  // currency, and a mapping cannot read the currency off a row that returned
  // none.
  currency: row.currency,
  // CARRIED, not looked up. The day is volatile and must not live in a record
  // held for a session — but computing it per request needs the zone, and the
  // zone is stable. So the record carries the zone and the `scope` hook derives
  // the day from it, with no second read anywhere.
  timezone: row.timezone,
  automationActor: row.studio_id === '' ? '' : `automation@${row.studio_id}`,
});

const PERSON = /* sql */ `
  SELECT
    p.id, p.name,
    COALESCE(sf.studio_id, sp.studio_id) AS studio_id,
    st.name     AS studio_name,
    st.timezone, st.country, st.locale, st.currency,
    sf.role     AS staff_role,
    sp.id       AS studio_person_id,
    ARRAY(
      SELECT si.integration_id FROM studio_integrations si
       WHERE si.studio_id = COALESCE(sf.studio_id, sp.studio_id) AND si.enabled
    ) AS installed
  FROM people p
  LEFT JOIN staff sf         ON sf.person_id = p.id AND sf.active
  LEFT JOIN studio_people sp ON sp.person_id = p.id
  LEFT JOIN studios st       ON st.id = COALESCE(sf.studio_id, sp.studio_id)
  WHERE p.id = $1 AND COALESCE(sf.studio_id, sp.studio_id) IS NOT NULL
  -- Oldest anchor first, so somebody known to two studios resolves
  -- deterministically to the one that has known them longest. Proper
  -- multi-studio identity is a later feature and a decided one (D6).
  ORDER BY sp.first_seen_on DESC NULLS LAST
  LIMIT 1
`;

const STUDIO = /* sql */ `
  SELECT
    st.id AS studio_id, st.name AS studio_name, st.timezone, st.country, st.locale, st.currency,
    ARRAY(SELECT si.integration_id FROM studio_integrations si WHERE si.studio_id = st.id AND si.enabled) AS installed
  FROM studios st WHERE st.id = $1
`;

// NOBODY. A token that verifies for a principal this deployment cannot resolve
// lands on the lock screen — never inside the application, and never on the
// member rung, which is a working application. `public` is the honest answer to
// "who is this" when the answer is "we do not know".
const STRANGER: IdentityRecord = { roles: ['public'], scope: {}, installed: [] };

/** An integration actor is `ig_<pack>@<studio>` — the id names both halves. */
const actorParts = (principal: string): { pack: string; studioId: string } | undefined => {
  if (!principal.startsWith('ig_')) return undefined;
  const rest = principal.slice('ig_'.length);
  const at = rest.indexOf('@');
  if (at < 1 || at === rest.length - 1) return undefined;
  return { pack: rest.slice(0, at), studioId: rest.slice(at + 1) };
};

export const identityFor = async (pool: PgPool, principal: string, rungOf: (actorId: string) => string | undefined): Promise<IdentityRecord> => {
  // ── an integration acting for a tenant ──
  //
  // Deliberately FIRST, and deliberately not a directory lookup: an actor for a
  // pack installed after this process booted has no row anywhere, and resolving
  // it as an unknown person would put a payments pack on the member rung — which
  // reads nothing and refuses quietly, which is the worst way for this to fail.
  const actor = actorParts(principal);
  if (actor !== undefined) {
    const result = await pool.query(STUDIO, [actor.studioId]);
    const row = result.rows[0] as Row | undefined;
    if (row === undefined) return STRANGER;
    const installed = row.installed ?? [];
    // The install is the credential's lifetime: uninstalling the pack is what
    // revokes its actor, and there is no second mechanism to forget.
    if (!installed.includes(actor.pack)) return STRANGER;
    return {
      roles: [rungOf(principal) ?? 'integration'],
      installed,
      // No `personId`: an actor is not somebody the studio knows, which is what
      // a pack's "only a member can pay" check keys on.
      scope: { ...studioScope(row), personId: '', name: `${actor.pack} (integration)`, studioName: row.studio_name, audience: 'integration', trains: false },
    };
  }

  // ── a person ──
  const result = await pool.query(PERSON, [principal]);
  const row = result.rows[0] as Row | undefined;
  if (row === undefined) return STRANGER;

  return {
    roles: rolesOf({ audience: audienceOf(row.staff_role ?? ''), studioPersonId: row.studio_person_id }),
    installed: row.installed ?? [],
    scope: {
      ...studioScope(row),
      // Set only for people the studio KNOWS (the anchor row) — staff-only
      // principals get '', which is what a pack's "only somebody the studio
      // knows can pay" check keys on.
      personId: row.studio_person_id !== null ? row.id : '',
      // WHAT A SHELL NEEDS TO GREET SOMEBODY. Carried on the record because
      // `inputs` used to reach into a resident directory for exactly these
      // four, and they are stable for the life of a session by definition —
      // they are who the person is.
      name: row.name,
      studioName: row.studio_name,
      audience: audienceOf(row.staff_role ?? ''),
      // Whether the studio KNOWS them, which is what decides the member-shaped
      // half of the navigation.
      trains: row.studio_person_id !== null,
    },
  };
};
