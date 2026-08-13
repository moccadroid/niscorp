import { mintDevToken } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';

export type Audience = 'owner' | 'manager' | 'instructor' | 'desk' | 'member' | 'automation' | 'integration';

export type Person = {
  id: string;
  email: string;
  name: string;
  studioId: string;
  studioName: string;
  audience: Audience;
  staffId: string | null;
  /** The studio_people anchor — this human is KNOWN to their studio. Null only
   *  for staff-only principals and integration actors. */
  studioPersonId: string | null;
};

let DIRECTORY: Record<string, Person> = {};
// Each studio's timezone, loaded with the directory. The one place the JS half
// of the clock reads from.
const TIMEZONES: Record<string, string> = {};
// And where it trades. Same load, same reason: derived per studio, never sent.
const COUNTRIES: Record<string, string> = {};
// And what language it reads in. Same load, same reason again — and this one
// decides both which words a shell wears and how its numbers and dates format.
const LOCALES: Record<string, string> = {};
let BY_EMAIL: Record<string, Person> = {};

const AUDIENCE_OF: Record<string, Audience> = { owner: 'owner', manager: 'manager', instructor: 'instructor', desk: 'desk', automation: 'automation' };

/** A staff role as the charter's audience. Anything unrecognised lands on the
 *  bottom rung — the charter THROWS on a role it does not know, so resolving
 *  downward has to happen here, before it ever sees one. */
export const audienceOf = (role: string): Audience => AUDIENCE_OF[role] ?? 'member';

/** EVERY role a person holds, not one. The schema splits `staff` and
 *  `studio_people` because a person can be both at a studio; flattening them to
 *  a single word here is what makes an instructor who trains stop being a
 *  member the moment the charter looks at them.
 *
 *  Being KNOWN to the studio is what grants the member-shaped surface — the
 *  prospect choosing a plan, the pass holder booking their class and the
 *  supplier checking an invoice address all sign in through it. What each of
 *  them SEES there is derived standing; what they may WRITE is pinned to their
 *  own person_id by scope, so the surface being shared costs nothing. */
export const rolesOf = (person: { audience: string; studioPersonId: string | null }): readonly string[] => {
  const roles: string[] = [];
  if (person.audience !== 'member') roles.push(person.audience);
  if (person.studioPersonId !== null) roles.push('member');
  return roles.length > 0 ? roles : ['member'];
};

// Loaded beside the directory for the same reason: moss asks per request.
const INSTALLED: Record<string, string[]> = {};

/** Integration ids live for whoever this principal is. Empty for anonymous. */
export const installedFor = (principal: string | null): readonly string[] => {
  if (principal === null) return [];
  const person = personById(principal);
  return person === undefined ? [] : (INSTALLED[person.studioId] ?? []);
};

export const loadDirectory = async (pool: PgPool): Promise<void> => {
  for (const key of Object.keys(INSTALLED)) delete INSTALLED[key];
  const installs = await pool.query('SELECT studio_id, integration_id FROM studio_integrations WHERE enabled = true');
  for (const raw of installs.rows) {
    const row = raw as { studio_id: string; integration_id: string };
    (INSTALLED[row.studio_id] ??= []).push(row.integration_id);
  }

  const zones = await pool.query('SELECT id, name, timezone, country, locale FROM studios');
  const studioNames: Record<string, string> = {};
  for (const zone of zones.rows as { id: string; name: string; timezone: string; country: string; locale: string }[]) {
    TIMEZONES[zone.id] = zone.timezone;
    COUNTRIES[zone.id] = zone.country;
    LOCALES[zone.id] = zone.locale;
    studioNames[zone.id] = zone.name;
  }

  // A principal is anybody the studio KNOWS (studio_people) or employs (staff)
  // — which is the whole point of the anchor table: the supplier the studio
  // deals with every fortnight resolves here without anybody fraudulently
  // giving him a membership. Ordered oldest-anchor-first so a person known to
  // two studios (the physio both gyms refer to) resolves deterministically to
  // the studio that has known them longest; proper multi-studio identity stays
  // a later feature, as PLAN.md always said.
  const result = await pool.query(/* sql */ `
    SELECT
      p.id, p.email, p.name,
      COALESCE(sf.studio_id, sp.studio_id) AS studio_id,
      st.name  AS studio_name,
      sf.role  AS staff_role,
      sf.id    AS staff_id,
      sp.id    AS studio_person_id
    FROM people p
    LEFT JOIN staff sf         ON sf.person_id = p.id AND sf.active
    LEFT JOIN studio_people sp ON sp.person_id = p.id
    LEFT JOIN studios st       ON st.id = COALESCE(sf.studio_id, sp.studio_id)
    WHERE COALESCE(sf.studio_id, sp.studio_id) IS NOT NULL
    ORDER BY sp.first_seen_on DESC NULLS LAST
  `);

  const directory: Record<string, Person> = {};
  const byEmail: Record<string, Person> = {};
  for (const row of result.rows) {
    const staffRole = row['staff_role'] === null || row['staff_role'] === undefined ? '' : String(row['staff_role']);
    const person: Person = {
      id: String(row['id']),
      email: String(row['email']),
      name: String(row['name']),
      studioId: String(row['studio_id']),
      studioName: String(row['studio_name'] ?? ''),
      audience: audienceOf(staffRole),
      staffId: row['staff_id'] === null || row['staff_id'] === undefined ? null : String(row['staff_id']),
      studioPersonId: row['studio_person_id'] === null || row['studio_person_id'] === undefined ? null : String(row['studio_person_id']),
    };
    directory[person.id] = person;
    byEmail[person.email.toLowerCase()] = person;
  }

  for (const [studioId, integrations] of Object.entries(INSTALLED)) {
    for (const integrationId of integrations) {
      const id = integrationActorId(integrationId, studioId);
      directory[id] = {
        id,
        email: `${integrationId}@integrations.${studioId}`,
        name: `${integrationId} (integration)`,
        studioId,
        studioName: studioNames[studioId] ?? '',
        audience: 'integration',
        staffId: null,
        studioPersonId: null,
      };
    }
  }

  DIRECTORY = directory;
  BY_EMAIL = byEmail;
};

const integrationActorId = (integration: string, studioId: string): string => `ig_${integration}@${studioId}`;

/** The principal an integration acts as at this studio — or null, which is a
 *  refusal: no install, no actor, and the keyed call dies at the door. */
export const integrationActorFor = (integration: string, studioId: string): string | null => {
  const id = integrationActorId(integration, studioId);
  return DIRECTORY[id] === undefined ? null : id;
};

export const studioToday = (studioId: string): string => {
  if (studioId === '') return '';
  const timezone = TIMEZONES[studioId] ?? 'UTC';
  // `en-CA` because it formats as YYYY-MM-DD, which is what a DATE column
  // compares against. An offset calculation is how a calendar ends up a day out
  // twice a year.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

/** The last day a read looks ahead to — the studio's day plus four weeks. */
export const studioHorizon = (studioId: string): string => {
  const today = studioToday(studioId);
  if (today === '') return '';
  return new Date(Date.parse(`${today}T00:00:00Z`) + 27 * 86_400_000).toISOString().slice(0, 10);
};

/** Where a studio trades, ISO-3166 alpha-2. Empty for no studio — the same
 *  answer `studioToday` gives, and for the same reason: a plausible default is
 *  worse than nothing when it decides which law a contract sits under. */
export const studioCountry = (studioId: string): string => COUNTRIES[studioId] ?? '';

/** What language a studio reads in, BCP-47. Unlike `studioCountry`, this one
 *  does have a safe default: no studio means the login screen, which somebody
 *  who is not signed in yet has to be able to read in something. */
export const studioLocale = (studioId: string): string => LOCALES[studioId] ?? 'en-GB';

export const personById = (principal: string | null): Person | undefined => (principal === null ? undefined : DIRECTORY[principal]);
export const personByEmail = (email: string): Person | undefined => BY_EMAIL[email.trim().toLowerCase()];
export const everyone = (): Person[] => Object.values(DIRECTORY);

// ─── the credential ──────────────────────────────────────────
export const mintToken = (email: string): string | null => {
  const person = personByEmail(email);
  return person === undefined ? null : mintDevToken(person.id);
};
