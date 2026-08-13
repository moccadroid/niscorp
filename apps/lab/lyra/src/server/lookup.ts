import type { PgPool } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE POINT READS THAT REPLACED THE DIRECTORY.
//
// Every function here answers about ONE thing — one principal, one studio, one
// pack — and reads the row when it is asked. There is no map, no loader, and
// nothing here outlives the call.
//
// What was here before was `server/users.ts`: eight module-level caches filled
// at boot by a cross join over the whole population, held so that six
// SYNCHRONOUS seams could be answered. Every one of those seams is asynchronous
// now, which is the only thing that ever stood between this file and that one
// (docs/plans/lyra-identity.md, Part 1).
// ═══════════════════════════════════════════════════════════════

/** Which studio a principal belongs to. Empty for anonymous or unknown — an
 *  answer, not an error, and the one every caller already handles. */
export const studioOf = async (pool: PgPool, principal: string | null): Promise<string> => {
  if (principal === null || principal === '') return '';
  // An integration actor is `ig_<pack>@<studio>`: the id names its tenant, so
  // there is nothing to look up.
  if (principal.startsWith('ig_')) return principal.slice(principal.indexOf('@') + 1);
  const result = await pool.query(
    /* sql */ `
      SELECT COALESCE(sf.studio_id, sp.studio_id) AS studio_id
      FROM people p
      LEFT JOIN staff sf ON sf.person_id = p.id AND sf.active
      LEFT JOIN studio_people sp ON sp.person_id = p.id
      WHERE p.id = $1 AND COALESCE(sf.studio_id, sp.studio_id) IS NOT NULL
      LIMIT 1
    `,
    [principal],
  );
  return String((result.rows[0] as { studio_id?: unknown } | undefined)?.studio_id ?? '');
};

/** Integration ids live for whoever this principal is. Empty for anonymous. */
export const installedFor = async (pool: PgPool, principal: string | null): Promise<readonly string[]> => {
  const studioId = await studioOf(pool, principal);
  if (studioId === '') return [];
  const result = await pool.query(/* sql */ `SELECT integration_id FROM studio_integrations WHERE studio_id = $1 AND enabled`, [studioId]);
  return result.rows.map((row) => String(row['integration_id']));
};

/** The principal an integration acts as at a studio — or null, which is a
 *  refusal: no install, no actor, and the keyed call dies at the door. The
 *  install IS the credential's lifetime; there is no second way to revoke it. */
export const integrationActorFor = async (pool: PgPool, integration: string, studioId: string): Promise<string | null> => {
  if (integration === '' || studioId === '') return null;
  const result = await pool.query(
    /* sql */ `SELECT 1 FROM studio_integrations WHERE studio_id = $1 AND integration_id = $2 AND enabled`,
    [studioId, integration],
  );
  return result.rows.length === 0 ? null : `ig_${integration}@${studioId}`;
};

/** The principal a studio's unattended work runs as, or null where a studio has
 *  no robot — a refusal, because work with no identity must not quietly borrow
 *  somebody else's. */
export const automationFor = async (pool: PgPool, studioId: string): Promise<string | null> => {
  if (studioId === '') return null;
  const result = await pool.query(
    /* sql */ `SELECT sf.person_id FROM staff sf WHERE sf.studio_id = $1 AND sf.role = 'automation' AND sf.active LIMIT 1`,
    [studioId],
  );
  const id = (result.rows[0] as { person_id?: unknown } | undefined)?.person_id;
  return id === undefined || id === null ? null : String(id);
};

/** What language a studio reads in, BCP-47. `en-GB` for no studio — the login
 *  screen has to be readable by somebody who is not signed in yet. */
export const localeOf = async (pool: PgPool, studioId: string): Promise<string> => {
  if (studioId === '') return 'en-GB';
  const result = await pool.query(/* sql */ `SELECT locale FROM studios WHERE id = $1`, [studioId]);
  return String((result.rows[0] as { locale?: unknown } | undefined)?.locale ?? 'en-GB');
};

/** The address somebody signs in with → the principal behind it. The one
 *  lookup that is BY something other than a key, and it exists because a person
 *  types an address rather than an id. Pinned, parameterised, one row. */
export const principalByEmail = async (pool: PgPool, email: string): Promise<string | null> => {
  const address = email.trim().toLowerCase();
  if (address === '') return null;
  const result = await pool.query(/* sql */ `SELECT id FROM people WHERE lower(email) = $1 LIMIT 1`, [address]);
  const id = (result.rows[0] as { id?: unknown } | undefined)?.id;
  return id === undefined || id === null ? null : String(id);
};

/** Name and standing for one person — what a screen needs to say who somebody
 *  is. Used by the surfaces that name a principal they did not resolve. */
export const personCard = async (pool: PgPool, principal: string): Promise<{ id: string; name: string; studioId: string; audience: string } | undefined> => {
  const result = await pool.query(
    /* sql */ `
      SELECT p.id, p.name, COALESCE(sf.studio_id, sp.studio_id) AS studio_id, COALESCE(sf.role, 'member') AS audience
      FROM people p
      LEFT JOIN staff sf ON sf.person_id = p.id AND sf.active
      LEFT JOIN studio_people sp ON sp.person_id = p.id
      WHERE p.id = $1 AND COALESCE(sf.studio_id, sp.studio_id) IS NOT NULL
      LIMIT 1
    `,
    [principal],
  );
  const row = result.rows[0] as { id: string; name: string; studio_id: string; audience: string } | undefined;
  return row === undefined ? undefined : { id: String(row.id), name: String(row.name), studioId: String(row.studio_id), audience: String(row.audience) };
};
